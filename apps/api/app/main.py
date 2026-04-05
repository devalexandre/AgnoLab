from __future__ import annotations

import asyncio
import base64
from datetime import datetime, timezone
import html
import json
import os
from pathlib import Path
import re
import threading
import time
from typing import Any

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
import requests
from starlette.datastructures import UploadFile as StarletteUploadFile

from .builtin_tools import inspect_builtin_tool_functions
from .compiler import compile_graph
from .email_listener import EmailListenerManager
from .executor import run_generated_code
from .exporter import export_project
from .flow_store import delete_flow_record, list_flow_summaries, load_flow_record, normalize_flow_name, save_flow_record
from .models import (
    CanvasGraph,
    BuiltInToolFunctionOption,
    BuiltInToolFunctionsRequest,
    ListCanvasTemplatesResponse,
    ListBuiltInToolFunctionsResponse,
    ListSkillPathsResponse,
    CodegenRequest,
    CodegenResponse,
    ListEmailListenerStatusesResponse,
    ListFlowRuntimeStatusesResponse,
    ListQueueSubscriberStatusesResponse,
    ExportProjectResponse,
    FlowRuntimeStatus,
    FlowRecord,
    GraphNode,
    ListFlowsResponse,
    RunResult,
    RunSavedFlowByNameRequest,
    SaveFlowRequest,
    SaveFlowResponse,
    SkillPathOption,
    QueueSubscriberStatus,
    WhatsappSessionStatus,
    WhatsappWebhookDispatchResponse,
)
from .models import NodeType
from .queue_subscriber import QueueSubscriberManager, extract_queue_subscriber_configs
from .sample_graph import build_sample_graph, get_canvas_template, list_canvas_templates
from .whatsapp_gateway import WhatsappGatewayClient, normalize_whatsapp_session_id

load_dotenv()

app = FastAPI(title="AgnoLab API", version="0.1.0")

DEFAULT_GENERATED_CODE_TIMEOUT_SECONDS = 20.0
RESULT_START_MARKER = "__AGNO_RESULT_START__"
RESULT_END_MARKER = "__AGNO_RESULT_END__"
WHATSAPP_EVENT_DEDUP_TTL_SECONDS = 120.0
WHATSAPP_IGNORED_EVENT_NAME_PARTS = ("ack", "receipt", "reaction", "presence", "status", "state")
_recent_whatsapp_events: dict[str, float] = {}
_flow_runtime_lock = threading.Lock()
_flow_runtime_stats_by_name: dict[str, dict[str, object]] = {}

QUEUE_INPUT_NODE_TYPES = {
    NodeType.RABBITMQ_INPUT,
    NodeType.KAFKA_INPUT,
    NodeType.REDIS_INPUT,
    NodeType.NATS_INPUT,
    NodeType.SQS_INPUT,
    NodeType.PUBSUB_INPUT,
}

QUEUE_OUTPUT_NODE_TYPES = {
    NodeType.RABBITMQ_OUTPUT,
    NodeType.KAFKA_OUTPUT,
    NodeType.REDIS_OUTPUT,
    NodeType.NATS_OUTPUT,
    NodeType.SQS_OUTPUT,
    NodeType.PUBSUB_OUTPUT,
}


def _runtime_timestamp_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_flow_runtime_stats(flow_name: str) -> dict[str, object]:
    normalized_name = normalize_flow_name(flow_name)
    stats = _flow_runtime_stats_by_name.get(normalized_name)
    if stats is None:
        stats = {
            "flow_name": flow_name,
            "active_runs": 0,
            "total_runs": 0,
            "success_runs": 0,
            "failed_runs": 0,
            "last_source": None,
            "last_started_at": None,
            "last_finished_at": None,
            "last_duration_ms": None,
            "last_error": None,
        }
        _flow_runtime_stats_by_name[normalized_name] = stats
    else:
        stats["flow_name"] = flow_name
    return stats


def _record_flow_runtime_start(flow_name: str, *, source: str) -> None:
    with _flow_runtime_lock:
        stats = _ensure_flow_runtime_stats(flow_name)
        stats["active_runs"] = int(stats.get("active_runs") or 0) + 1
        stats["total_runs"] = int(stats.get("total_runs") or 0) + 1
        stats["last_source"] = source
        stats["last_started_at"] = _runtime_timestamp_now()


def _record_flow_runtime_finish(flow_name: str, *, source: str, success: bool, duration_ms: int, error: str | None) -> None:
    with _flow_runtime_lock:
        stats = _ensure_flow_runtime_stats(flow_name)
        active_runs = int(stats.get("active_runs") or 0)
        stats["active_runs"] = max(0, active_runs - 1)
        if success:
            stats["success_runs"] = int(stats.get("success_runs") or 0) + 1
            stats["last_error"] = None
        else:
            stats["failed_runs"] = int(stats.get("failed_runs") or 0) + 1
            stats["last_error"] = (error or "Flow execution failed")[:500]
        stats["last_source"] = source
        stats["last_finished_at"] = _runtime_timestamp_now()
        stats["last_duration_ms"] = max(0, int(duration_ms))


def _list_flow_runtime_statuses(flow_name: str | None = None) -> list[FlowRuntimeStatus]:
    normalized_filter = normalize_flow_name(flow_name) if flow_name else None
    with _flow_runtime_lock:
        stats_items = list(_flow_runtime_stats_by_name.items())

    statuses: list[FlowRuntimeStatus] = []
    for normalized_name, raw_stats in stats_items:
        if normalized_filter and normalized_name != normalized_filter:
            continue
        statuses.append(
            FlowRuntimeStatus(
                flow_name=str(raw_stats.get("flow_name") or normalized_name),
                active_runs=int(raw_stats.get("active_runs") or 0),
                total_runs=int(raw_stats.get("total_runs") or 0),
                success_runs=int(raw_stats.get("success_runs") or 0),
                failed_runs=int(raw_stats.get("failed_runs") or 0),
                last_source=str(raw_stats.get("last_source") or "") or None,
                last_started_at=str(raw_stats.get("last_started_at") or "") or None,
                last_finished_at=str(raw_stats.get("last_finished_at") or "") or None,
                last_duration_ms=int(raw_stats.get("last_duration_ms") or 0) if raw_stats.get("last_duration_ms") is not None else None,
                last_error=str(raw_stats.get("last_error") or "") or None,
            )
        )

    statuses.sort(key=lambda item: normalize_flow_name(item.flow_name))
    return statuses


def _detect_project_root() -> Path:
    current = Path(__file__).resolve()
    markers = ("docker-compose.dev.yml", "docker-compose.yml", "README.md")

    for parent in current.parents:
        if any((parent / marker).exists() for marker in markers) or (parent / "apps").is_dir():
            return parent

    if current.parent.name == "app":
        return current.parent.parent

    return current.parent


PROJECT_ROOT = _detect_project_root()
SKILL_DISCOVERY_ROOTS = [
    ("repo", PROJECT_ROOT / "examples/skills"),
    ("user", Path.home() / ".agents/skills"),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

email_listener_manager = EmailListenerManager(
    trigger_flow=lambda flow_name, email_event: run_saved_flow_from_email_event(flow_name, email_event),
)
queue_subscriber_manager = QueueSubscriberManager(
    trigger_flow=lambda flow_name, node_id, payload_text, payload_metadata: run_saved_flow_from_queue_event(
        flow_name,
        node_id,
        payload_text,
        payload_metadata,
    ),
)


def format_skill_path_for_client(path: Path) -> str:
    resolved = path.resolve()
    home = Path.home().resolve()

    if resolved.is_relative_to(PROJECT_ROOT):
        return str(resolved.relative_to(PROJECT_ROOT))
    if resolved.is_relative_to(home):
        return f"~/{resolved.relative_to(home)}"
    return str(resolved)


def discover_skill_paths() -> list[SkillPathOption]:
    from agno.skills.validator import validate_skill_directory

    options: list[SkillPathOption] = []
    seen_paths: set[str] = set()

    for source, root in SKILL_DISCOVERY_ROOTS:
        if not root.exists() or not root.is_dir():
            continue

        skill_dirs = sorted({skill_md.parent.resolve() for skill_md in root.rglob("SKILL.md")}, key=lambda item: str(item))
        for skill_dir in skill_dirs:
            client_path = format_skill_path_for_client(skill_dir)
            if client_path in seen_paths:
                continue
            seen_paths.add(client_path)
            validation_errors = validate_skill_directory(skill_dir)
            validates = len(validation_errors) == 0
            validation_error = validation_errors[0] if validation_errors else None
            validation_suffix = "" if validates else " · validation incompatible"
            options.append(
                SkillPathOption(
                    path=client_path,
                    label=f"{skill_dir.name} ({client_path}){validation_suffix}",
                    source=source,
                    validates=validates,
                    validation_error=validation_error,
                )
            )

    return options


@app.on_event("startup")
def start_email_listener_service() -> None:
    email_listener_manager.start()
    queue_subscriber_manager.start()


@app.on_event("shutdown")
def stop_email_listener_service() -> None:
    email_listener_manager.stop()
    queue_subscriber_manager.stop()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def home() -> str:
    flows = list_flow_summaries()

    if not flows:
        flow_blocks = "<p>No saved flows yet. Save one via <code>POST /api/flows/save</code>.</p>"
    else:
        rendered_blocks: list[str] = []
        for flow in flows:
            flow_name = html.escape(flow.name)
            curl_command = f'''curl -X POST "http://localhost:8000/api/flows/run" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "name": "{flow_name}",
    "debug": false,
    "input_text": "Hello from POST",
    "input_metadata": {{
      "tenant": "acme"
    }}
  }}' '''
            rendered_blocks.append(
                f"""
                <section class=\"flow-card\">
                  <h3>{flow_name}</h3>
                  <p><strong>Updated at:</strong> {html.escape(flow.updated_at)}</p>
                  <p>Run this flow by name using cURL:</p>
                  <pre>{html.escape(curl_command)}</pre>
                </section>
                """
            )
        flow_blocks = "\n".join(rendered_blocks)

    return f"""
<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>AgnoLab Flows</title>
    <style>
      body {{
        margin: 0;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: #0f1319;
        color: #e8edf5;
      }}
      main {{
        max-width: 980px;
        margin: 0 auto;
        padding: 28px 20px 40px;
      }}
      h1 {{ margin: 0 0 10px; }}
      .muted {{ color: #9aa8be; }}
      .flow-grid {{
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 14px;
        margin-top: 20px;
      }}
      .flow-card {{
        border: 1px solid #243041;
        background: #131b24;
        border-radius: 12px;
        padding: 14px;
      }}
      .flow-card h3 {{ margin: 0 0 8px; }}
      .flow-card p {{ margin: 6px 0; }}
      pre {{
        margin: 10px 0 0;
        padding: 10px;
        border-radius: 8px;
        background: #0a0e14;
        border: 1px solid #273447;
        overflow: auto;
        white-space: pre-wrap;
      }}
      .links {{ margin-top: 10px; }}
      .links a {{ color: #8cc3ff; text-decoration: none; margin-right: 12px; }}
    </style>
  </head>
  <body>
    <main>
      <h1>Saved Flows</h1>
      <p class=\"muted\">Use this page to discover all saved flows and run any flow via cURL by passing the flow name.</p>
      <div class=\"links\">
        <a href=\"/docs\" target=\"_blank\" rel=\"noreferrer\">OpenAPI docs</a>
        <a href=\"/api/flows\" target=\"_blank\" rel=\"noreferrer\">GET /api/flows</a>
      </div>
      <div class=\"flow-grid\">{flow_blocks}</div>
    </main>
  </body>
</html>
"""


@app.get("/api/canvas/default")
def default_graph() -> dict:
    return build_sample_graph().model_dump()


@app.get("/api/canvas/templates", response_model=ListCanvasTemplatesResponse)
def list_templates() -> ListCanvasTemplatesResponse:
    return ListCanvasTemplatesResponse(templates=list_canvas_templates())


@app.get("/api/canvas/templates/{template_id}", response_model=CanvasGraph)
def get_template(template_id: str) -> CanvasGraph:
    graph = get_canvas_template(template_id)
    if graph is None:
        raise HTTPException(status_code=404, detail=f"Canvas template not found: {template_id}")
    return graph


@app.get("/api/skills/paths", response_model=ListSkillPathsResponse)
def list_skill_paths() -> ListSkillPathsResponse:
    return ListSkillPathsResponse(paths=discover_skill_paths())


@app.post("/api/tools/builtin/functions", response_model=ListBuiltInToolFunctionsResponse)
def list_builtin_tool_functions(request: BuiltInToolFunctionsRequest) -> ListBuiltInToolFunctionsResponse:
    functions, error = inspect_builtin_tool_functions(request.import_path, request.class_name, request.config)
    return ListBuiltInToolFunctionsResponse(
        functions=[BuiltInToolFunctionOption(**function) for function in functions],
        error=error,
    )


@app.post("/api/codegen/preview", response_model=CodegenResponse)
def preview_code(request: CodegenRequest) -> CodegenResponse:
    code, warnings = compile_graph(request.graph)
    return CodegenResponse(code=code, warnings=warnings)


@app.post("/api/executor/run", response_model=RunResult)
def run_code(request: CodegenRequest) -> RunResult:
    graph = request.graph
    if request.response_only:
        graph = apply_runtime_debug_flag(graph, debug=False)

    code, warnings = compile_graph(graph)
    success, stdout, stderr, exit_code = run_generated_code(
        code,
        extra_env=get_graph_runtime_env(graph),
        timeout_seconds=get_graph_execution_timeout_seconds(graph),
    )
    tagged_clean_stdout, stripped_stdout = extract_tagged_flow_result(stdout)
    clean_stdout = tagged_clean_stdout or extract_agent_response(stdout)
    response_stdout = clean_stdout if request.response_only else (stripped_stdout or stdout)
    return RunResult(
        success=success,
        stdout=response_stdout,
        clean_stdout=clean_stdout,
        stderr=stderr,
        exit_code=exit_code,
        code="" if request.response_only else code,
        warnings=[] if request.response_only else warnings,
    )


@app.get("/api/flows", response_model=ListFlowsResponse)
def list_flows() -> ListFlowsResponse:
    return ListFlowsResponse(flows=list_flow_summaries())


@app.get("/api/flows/runtime/statuses", response_model=ListFlowRuntimeStatusesResponse)
def list_flow_runtime_statuses(flow_name: str | None = None) -> ListFlowRuntimeStatusesResponse:
    return ListFlowRuntimeStatusesResponse(statuses=_list_flow_runtime_statuses(flow_name))


@app.get("/api/integrations/email/listeners", response_model=ListEmailListenerStatusesResponse)
def list_email_listener_statuses(flow_name: str | None = None) -> ListEmailListenerStatusesResponse:
    return ListEmailListenerStatusesResponse(listeners=email_listener_manager.list_statuses(flow_name))


@app.get("/api/integrations/queues/subscribers", response_model=ListQueueSubscriberStatusesResponse)
def list_queue_subscriber_statuses(flow_name: str | None = None) -> ListQueueSubscriberStatusesResponse:
    return ListQueueSubscriberStatusesResponse(subscribers=queue_subscriber_manager.list_statuses(flow_name))


@app.get("/api/integrations/queues/{flow_name}/{node_id}/subscriber/status", response_model=QueueSubscriberStatus)
def get_queue_subscriber_status(flow_name: str, node_id: str) -> QueueSubscriberStatus:
    record = load_flow_record(flow_name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {flow_name}")

    node = _find_saved_queue_input_node(record, node_id=node_id)
    config = _resolve_saved_queue_subscriber_config(record, node_id=node_id)
    status = queue_subscriber_manager.get_status(config.listener_key)
    return _build_queue_subscriber_status(record, node, status=status)


@app.post("/api/integrations/queues/{flow_name}/{node_id}/subscriber/start", response_model=QueueSubscriberStatus)
def start_queue_subscriber(flow_name: str, node_id: str) -> QueueSubscriberStatus:
    record = load_flow_record(flow_name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {flow_name}")

    node = _find_saved_queue_input_node(record, node_id=node_id)
    config = _resolve_saved_queue_subscriber_config(record, node_id=node_id)
    try:
        queue_subscriber_manager.start_subscriber(config)
        status = queue_subscriber_manager.get_status(config.listener_key)
        return _build_queue_subscriber_status(record, node, status=status)
    except Exception as error:
        return _build_queue_subscriber_status(record, node, status=None, last_error=str(error))


@app.post("/api/integrations/queues/{flow_name}/{node_id}/subscriber/stop", response_model=QueueSubscriberStatus)
def stop_queue_subscriber(flow_name: str, node_id: str) -> QueueSubscriberStatus:
    record = load_flow_record(flow_name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {flow_name}")

    node = _find_saved_queue_input_node(record, node_id=node_id)
    config = _resolve_saved_queue_subscriber_config(record, node_id=node_id)
    try:
        queue_subscriber_manager.stop_subscriber(config.listener_key)
        return _build_queue_subscriber_status(record, node, status=None)
    except Exception as error:
        return _build_queue_subscriber_status(record, node, status=None, last_error=str(error))


@app.post("/api/flows/save", response_model=SaveFlowResponse)
def save_flow(request: SaveFlowRequest) -> SaveFlowResponse:
    try:
        record = save_flow_record(request.name, request.graph)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    email_listener_manager.sync_saved_flows()
    queue_subscriber_manager.sync_saved_flows()

    return SaveFlowResponse(
        name=record.name,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@app.get("/api/flows/{name}", response_model=FlowRecord)
def get_flow(name: str) -> FlowRecord:
    record = load_flow_record(name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {name}")
    return record


@app.delete("/api/flows/{name}")
def delete_flow(name: str) -> dict[str, str]:
    record = load_flow_record(name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {name}")

    deleted = delete_flow_record(name)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Flow not found: {name}")

    email_listener_manager.sync_saved_flows()
    queue_subscriber_manager.sync_saved_flows()

    return {"name": normalize_flow_name(name), "status": "deleted"}


def normalize_ollama_base_url(base_url: str | None) -> str:
    normalized = (base_url or "").strip() or "http://localhost:11434"
    normalized = normalized.rstrip("/")
    if normalized.endswith("/v1"):
        normalized = normalized[: -len("/v1")]
    return normalized


def _parse_positive_timeout_seconds(value: object) -> float | None:
    if value in (None, ""):
        return None

    try:
        timeout_seconds = float(value)
    except (TypeError, ValueError):
        return None

    if timeout_seconds <= 0:
        return None

    return timeout_seconds


def get_graph_execution_timeout_seconds(graph: CanvasGraph) -> float:
    timeout_seconds = DEFAULT_GENERATED_CODE_TIMEOUT_SECONDS

    for node in graph.nodes:
        if node.type != NodeType.AGENT:
            continue

        extras = node.data.extras if isinstance(node.data.extras, dict) else {}
        provider_config = extras.get("providerConfig") if isinstance(extras, dict) else {}
        if not isinstance(provider_config, dict):
            continue

        raw_timeout = provider_config.get("provider_execution_timeout_seconds") or provider_config.get("execution_timeout_seconds")
        parsed_timeout = _parse_positive_timeout_seconds(raw_timeout)
        if parsed_timeout is None:
            continue

        timeout_seconds = max(timeout_seconds, parsed_timeout)

    return timeout_seconds


def get_graph_runtime_env(graph: CanvasGraph) -> dict[str, str]:
    runtime = getattr(graph.project, "runtime", None)
    env_items = getattr(runtime, "envVars", []) if runtime is not None else []
    resolved_env: dict[str, str] = {}

    for item in env_items:
        key = str(getattr(item, "key", "") or "").strip()
        value = str(getattr(item, "value", "") or "")
        if not key or value == "":
            continue
        resolved_env[key] = value

    return resolved_env


def is_graph_bearer_auth_enabled(graph: CanvasGraph) -> bool:
    runtime = getattr(graph.project, "runtime", None)
    return bool(getattr(runtime, "authEnabled", False))


def get_graph_bearer_auth_token(graph: CanvasGraph) -> str:
    runtime = getattr(graph.project, "runtime", None)
    return str(getattr(runtime, "authToken", "") or "").strip()


def extract_bearer_token(request: Request) -> str:
    authorization = request.headers.get("authorization", "").strip()
    if not authorization:
        return ""

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return ""
    return token.strip()


def require_flow_bearer_auth(record: FlowRecord, request: Request) -> None:
    if not is_graph_bearer_auth_enabled(record.graph):
        return

    expected_token = get_graph_bearer_auth_token(record.graph)
    if not expected_token:
        raise HTTPException(status_code=400, detail="Flow bearer authentication is enabled but no token is configured.")

    provided_token = extract_bearer_token(request)
    if provided_token != expected_token:
        raise HTTPException(status_code=401, detail="Missing or invalid bearer token for this flow.")


def _normalize_bool(value: object, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value or "").strip().lower()
    if normalized in {"true", "1", "yes", "on"}:
        return True
    if normalized in {"false", "0", "no", "off"}:
        return False
    return default


def _split_filter_values(raw_value: object) -> list[str]:
    return [item.strip().lower() for item in re.split(r"[\n,]+", str(raw_value or "")) if item.strip()]


def _field_matches(value: object, raw_filter: object) -> bool:
    filter_values = _split_filter_values(raw_filter)
    if not filter_values:
        return True
    haystack = str(value or "").lower()
    return any(filter_value in haystack for filter_value in filter_values)


def _keywords_match(value: object, raw_keywords: object) -> bool:
    keywords = _split_filter_values(raw_keywords)
    if not keywords:
        return True
    haystack = str(value or "").lower()
    return all(keyword in haystack for keyword in keywords)


def _recursive_find_first_string(payload: Any, keys: tuple[str, ...]) -> str:
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        for value in payload.values():
            found = _recursive_find_first_string(value, keys)
            if found:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _recursive_find_first_string(item, keys)
            if found:
                return found
    return ""


def _looks_like_base64_text(value: str) -> bool:
    compact = "".join(str(value or "").split())
    if len(compact) < 32:
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9+/=_-]+", compact))


def _guess_extension_from_mime(mime_type: str) -> str:
    normalized = str(mime_type or "").split(";", 1)[0].strip().lower()
    if normalized in {"audio/ogg", "audio/opus"}:
        return "ogg"
    if normalized == "audio/mpeg":
        return "mp3"
    if normalized in {"audio/mp4", "audio/x-m4a"}:
        return "m4a"
    if normalized == "audio/wav":
        return "wav"
    if normalized.startswith("audio/"):
        return normalized.split("/", 1)[1] or "bin"
    return "bin"


def _extract_whatsapp_runtime_files(message_event: dict[str, Any]) -> list[dict[str, object]]:
    raw_payload = message_event.get("raw")
    if not isinstance(raw_payload, dict):
        return []

    mime_type = _recursive_find_first_string(raw_payload, ("mimetype", "mimeType", "mediaType"))
    media_type = str(raw_payload.get("type") or raw_payload.get("messageType") or "").strip().lower()
    body_value = _recursive_find_first_string(raw_payload, ("base64", "fileData", "data", "body", "content"))
    compact_base64 = "".join(str(body_value or "").split())

    is_audio_like = str(mime_type).lower().startswith("audio/") or media_type in {"audio", "ptt", "voice", "voice_note"}
    if not is_audio_like:
        return []

    if not _looks_like_base64_text(compact_base64):
        return []

    normalized_mime = str(mime_type or "").split(";", 1)[0].strip().lower() or "audio/ogg"
    file_name = _recursive_find_first_string(raw_payload, ("filename", "fileName", "name"))
    if not file_name:
        extension = _guess_extension_from_mime(normalized_mime)
        file_name = f"whatsapp_audio.{extension}"

    return [
        {
            "name": file_name,
            "alias": "WhatsApp Audio",
            "mime_type": normalized_mime,
            "encoding": "base64",
            "base64": compact_base64,
        }
    ]


def _transcribe_whatsapp_audio_with_openai(runtime_files: list[dict[str, object]]) -> str:
    api_key = str(os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return ""

    base_url = str(os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().rstrip("/")
    endpoint = f"{base_url}/audio/transcriptions"

    for file_item in runtime_files:
        mime_type = str(file_item.get("mime_type") or "").strip().lower()
        if not mime_type.startswith("audio/"):
            continue

        encoded = str(file_item.get("base64") or "").strip()
        if not encoded:
            continue

        try:
            audio_bytes = base64.b64decode(encoded, validate=False)
        except Exception:
            continue

        if not audio_bytes:
            continue

        file_name = str(file_item.get("name") or "whatsapp_audio.ogg")
        try:
            response = requests.post(
                endpoint,
                headers={"Authorization": f"Bearer {api_key}"},
                data={"model": "gpt-4o-mini-transcribe"},
                files={"file": (file_name, audio_bytes, mime_type or "application/octet-stream")},
                timeout=45,
            )
            if not response.ok:
                continue
            payload = response.json()
            transcript = str(payload.get("text") or "").strip() if isinstance(payload, dict) else ""
            if transcript:
                return transcript
        except Exception:
            continue

    return ""


def _extract_whatsapp_message_text(payload: dict[str, Any]) -> str:
    message_type = str(payload.get("type") or payload.get("messageType") or "").strip().lower()
    mime_hint = str(payload.get("mimetype") or payload.get("mimeType") or "").strip().lower()
    is_audio_message = message_type in {"audio", "ptt", "voice", "voice_note"} or mime_hint.startswith("audio/")
    for key in ("body", "content", "caption", "text"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            candidate = value.strip()
            if key == "body" and is_audio_message:
                continue
            return candidate
        if isinstance(value, dict):
            nested_value = value.get("body")
            if isinstance(nested_value, str) and nested_value.strip():
                return nested_value.strip()
    return ""


def _extract_whatsapp_message_id(payload: dict[str, Any]) -> str:
    raw_id = payload.get("id")
    if isinstance(raw_id, str) and raw_id.strip():
        return raw_id.strip()
    if isinstance(raw_id, dict):
        for key in ("_serialized", "id", "remote"):
            value = raw_id.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _extract_whatsapp_sender_name(payload: dict[str, Any]) -> str:
    sender = payload.get("sender")
    if isinstance(sender, dict):
        for key in ("pushname", "name", "shortName", "formattedName"):
            value = sender.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    for key in ("notifyName", "senderName", "chatName"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _extract_whatsapp_message_candidate(payload: Any) -> dict[str, Any] | None:
    if isinstance(payload, list):
        for item in payload:
            candidate = _extract_whatsapp_message_candidate(item)
            if candidate is not None:
                return candidate
        return None

    if not isinstance(payload, dict):
        return None

    direct_from = str(payload.get("from") or payload.get("chatId") or payload.get("author") or "").strip()
    direct_text = _extract_whatsapp_message_text(payload)
    if direct_from or direct_text:
        return payload

    for key in ("message", "messages", "data", "response", "payload", "eventData"):
        nested = payload.get(key)
        candidate = _extract_whatsapp_message_candidate(nested)
        if candidate is not None:
            return candidate
    return None


def _extract_whatsapp_message_event(payload: Any) -> dict[str, Any] | None:
    candidate = _extract_whatsapp_message_candidate(payload)
    if candidate is None:
        return None

    from_value = str(candidate.get("from") or candidate.get("chatId") or candidate.get("author") or "").strip()
    text_value = _extract_whatsapp_message_text(candidate)
    is_group = _normalize_bool(candidate.get("isGroupMsg"), False) or _normalize_bool(candidate.get("isGroup"), False) or from_value.endswith("@g.us")
    from_me = _normalize_bool(candidate.get("fromMe"), False) or _normalize_bool(candidate.get("isSentByMe"), False)
    message_id = _extract_whatsapp_message_id(candidate)
    sender_name = _extract_whatsapp_sender_name(candidate)

    return {
        "text": text_value,
        "from": from_value,
        "sender_name": sender_name,
        "message_id": message_id,
        "is_group": is_group,
        "from_me": from_me,
        "timestamp": str(candidate.get("t") or candidate.get("timestamp") or "").strip(),
        "raw": candidate,
    }


def _normalize_whatsapp_reply_target(sender: str, *, is_group: bool) -> str:
    raw_sender = str(sender or "").strip()
    if not raw_sender:
        return ""
    if is_group:
        return raw_sender
    return raw_sender.split("@", 1)[0]


def _replace_template_tokens(template: str, context: dict[str, object]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = context.get(key)
        if value is None:
            return ""
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value)

    return re.sub(r"\$([A-Za-z_][A-Za-z0-9_]*)", replace, template)


def _should_ignore_whatsapp_event(event_name: str) -> bool:
    normalized = str(event_name or "").strip().lower()
    if not normalized:
        return False
    return any(part in normalized for part in WHATSAPP_IGNORED_EVENT_NAME_PARTS)


def _remember_recent_whatsapp_event(flow_name: str, session_id: str, message_id: str) -> bool:
    normalized_message_id = str(message_id or "").strip()
    if not normalized_message_id:
        return False

    now = time.monotonic()
    expired_keys = [key for key, expires_at in _recent_whatsapp_events.items() if expires_at <= now]
    for key in expired_keys:
        _recent_whatsapp_events.pop(key, None)

    event_key = f"{flow_name}:{session_id}:{normalized_message_id}"
    if event_key in _recent_whatsapp_events:
        return True

    _recent_whatsapp_events[event_key] = now + WHATSAPP_EVENT_DEDUP_TTL_SECONDS
    return False


def _build_whatsapp_status_response(record: FlowRecord, input_node: GraphNode, *, status_payload: dict[str, Any], webhook_url: str, last_error: str | None = None) -> WhatsappSessionStatus:
    extras = input_node.data.extras if isinstance(input_node.data.extras, dict) else {}
    fallback_session_id = normalize_whatsapp_session_id(
        extras.get("whatsappSessionId"),
        fallback=f"{normalize_flow_name(record.name)}_{input_node.id}",
    )
    return WhatsappSessionStatus(
        flow_name=record.name,
        node_id=input_node.id,
        node_name=input_node.data.name,
        session_id=str(status_payload.get("session_id") or fallback_session_id),
        status=str(status_payload.get("status") or "unknown"),
        connected=bool(status_payload.get("connected")),
        qr_code=status_payload.get("qr_code"),
        webhook_url=webhook_url.split("?", 1)[0],
        last_error=last_error,
    )


def _build_whatsapp_gateway_for_graph(graph: CanvasGraph) -> WhatsappGatewayClient:
    runtime_env = get_graph_runtime_env(graph)
    return WhatsappGatewayClient(
        base_url=runtime_env.get("WHATSAPP_GATEWAY_BASE_URL"),
        secret_key=runtime_env.get("WHATSAPP_GATEWAY_SECRET_KEY"),
        webhook_base_url=runtime_env.get("WHATSAPP_WEBHOOK_BASE_URL"),
    )


def _get_saved_whatsapp_input(record: FlowRecord, *, node_id: str) -> tuple[GraphNode, dict[str, Any], str, str, str, WhatsappGatewayClient]:
    input_node = _find_saved_input_node(record, node_id=node_id, expected_source="whatsapp")
    extras = input_node.data.extras if isinstance(input_node.data.extras, dict) else {}
    session_id = normalize_whatsapp_session_id(
        extras.get("whatsappSessionId"),
        fallback=f"{normalize_flow_name(record.name)}_{input_node.id}",
    )
    webhook_secret = str(extras.get("whatsappWebhookSecret") or "").strip() or input_node.id
    gateway = _build_whatsapp_gateway_for_graph(record.graph)
    webhook_url = gateway.build_flow_webhook_url(record.name, input_node.id, webhook_secret)
    return input_node, extras, session_id, webhook_secret, webhook_url, gateway


@app.get("/api/providers/ollama/models")
def list_ollama_models(base_url: str | None = None) -> dict[str, list[str]]:
    endpoint_base = normalize_ollama_base_url(base_url)
    endpoint_url = f"{endpoint_base}/api/tags"

    try:
        response = requests.get(endpoint_url, timeout=5)
        response.raise_for_status()
        payload = response.json()
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch Ollama models from {endpoint_base}: {error}",
        ) from error

    raw_models = payload.get("models") if isinstance(payload, dict) else []
    if not isinstance(raw_models, list):
        return {"models": []}

    names: list[str] = []
    for item in raw_models:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        if name in names:
            continue
        names.append(name)

    return {"models": names}


def _normalize_input_source(node) -> str:
    extras = node.data.extras if isinstance(node.data.extras, dict) else {}
    return str(extras.get("inputSource") or "manual").strip().lower()


def _normalize_queue_provider(node) -> str:
    extras = node.data.extras if isinstance(node.data.extras, dict) else {}
    return str(extras.get("queueProvider") or "").strip().lower()


def _find_saved_input_node(record: FlowRecord, *, node_id: str, expected_source: str):
    input_node = next((node for node in record.graph.nodes if node.type == NodeType.INPUT and node.id == node_id), None)
    if input_node is None:
        raise HTTPException(status_code=404, detail=f"Input node not found in flow '{record.name}': {node_id}")

    input_source = _normalize_input_source(input_node)
    if input_source != expected_source:
        raise HTTPException(
            status_code=400,
            detail=f"Input node '{node_id}' is configured as '{input_source}', not '{expected_source}'.",
        )
    return input_node


def _find_saved_queue_input_node(record: FlowRecord, *, node_id: str):
    input_node = next((node for node in record.graph.nodes if node.type in QUEUE_INPUT_NODE_TYPES and node.id == node_id), None)
    if input_node is None:
        raise HTTPException(status_code=404, detail=f"Queue input node not found in flow '{record.name}': {node_id}")

    queue_provider = _normalize_queue_provider(input_node)
    if queue_provider not in {"rabbitmq", "kafka", "redis", "nats", "sqs", "pubsub"}:
        raise HTTPException(
            status_code=400,
            detail=f"Queue node '{node_id}' does not have a valid queue provider configured.",
        )
    return input_node


def _resolve_saved_queue_subscriber_config(record: FlowRecord, *, node_id: str):
    _find_saved_queue_input_node(record, node_id=node_id)
    configs = extract_queue_subscriber_configs(record)
    config = next((candidate for candidate in configs if candidate.node_id == node_id), None)
    if config is None:
        raise HTTPException(
            status_code=400,
            detail=f"Queue subscriber config for node '{node_id}' is incomplete.",
        )
    return config


def _build_queue_subscriber_status(record: FlowRecord, node: GraphNode, *, status: QueueSubscriberStatus | None = None, last_error: str | None = None) -> QueueSubscriberStatus:
    extras = node.data.extras if isinstance(node.data.extras, dict) else {}
    poll_interval_seconds = 5
    try:
        poll_interval_seconds = max(2, int(str(extras.get("queuePollIntervalSeconds") or "5").strip() or "5"))
    except (TypeError, ValueError):
        poll_interval_seconds = 5

    if status is not None:
        return status

    return QueueSubscriberStatus(
        flow_name=record.name,
        node_id=node.id,
        node_name=node.data.name,
        provider=_normalize_queue_provider(node),
        poll_interval_seconds=poll_interval_seconds,
        enabled=bool(extras.get("queueSubscriberEnabled") or False),
        connected=False,
        status="idle",
        last_error=last_error,
    )


def _collect_reachable_node_ids(graph: CanvasGraph, *, start_node_id: str | None) -> set[str]:
    all_node_ids = {node.id for node in graph.nodes}
    if not all_node_ids:
        return set()
    if not start_node_id or start_node_id not in all_node_ids:
        return all_node_ids

    adjacency: dict[str, list[str]] = {}
    for edge in graph.edges:
        adjacency.setdefault(edge.source, []).append(edge.target)

    reachable: set[str] = set()
    queue: list[str] = [start_node_id]
    while queue:
        current_id = queue.pop(0)
        if current_id in reachable:
            continue
        reachable.add(current_id)
        for target_id in adjacency.get(current_id, []):
            if target_id not in reachable:
                queue.append(target_id)
    return reachable


def _resolve_queue_output_nodes_for_dispatch(graph: CanvasGraph, *, target_input_node_id: str | None) -> list[GraphNode]:
    reachable_ids = _collect_reachable_node_ids(graph, start_node_id=target_input_node_id)
    return [
        node
        for node in graph.nodes
        if node.type in QUEUE_OUTPUT_NODE_TYPES and node.id in reachable_ids
    ]


def _publish_nats_output_payload(*, nats_url: str, nats_subject: str, payload_text: str) -> None:
    async def _publish() -> None:
        try:
            from nats.aio.client import Client as NATS
        except ModuleNotFoundError as error:
            raise RuntimeError("NATS output dependency missing. Install 'nats-py' to publish to NATS output nodes.") from error

        client = NATS()
        await client.connect(servers=[nats_url], connect_timeout=2)
        await client.publish(nats_subject, payload_text.encode("utf-8"))
        await client.flush(timeout=2)
        await client.drain()

    asyncio.run(_publish())


def _dispatch_queue_output_payloads(
    graph: CanvasGraph,
    *,
    payload_text: str,
    target_input_node_id: str | None,
) -> list[str]:
    message = payload_text.strip()
    if not message:
        return []

    dispatch_errors: list[str] = []
    output_nodes = _resolve_queue_output_nodes_for_dispatch(graph, target_input_node_id=target_input_node_id)
    for output_node in output_nodes:
        extras = output_node.data.extras if isinstance(output_node.data.extras, dict) else {}
        if output_node.type == NodeType.NATS_OUTPUT:
            nats_url = str(extras.get("natsUrl") or "nats://localhost:4222").strip()
            nats_subject = str(extras.get("natsSubject") or "agnolab.output").strip()
            if not nats_subject:
                dispatch_errors.append(f"Queue output '{output_node.data.name}' has an empty NATS subject.")
                continue
            try:
                _publish_nats_output_payload(nats_url=nats_url, nats_subject=nats_subject, payload_text=message)
            except Exception as error:
                dispatch_errors.append(f"NATS output '{output_node.data.name}' failed: {error}")
            continue

    return dispatch_errors


def _parse_json_text(raw_value: str) -> object | None:
    text = raw_value.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _coerce_text_value(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _pick_mapping_value(payload: object, preferred_key: str, fallback_keys: list[str]) -> str:
    if not isinstance(payload, dict):
        return ""

    candidate_keys: list[str] = []
    normalized_preferred_key = preferred_key.strip()
    if normalized_preferred_key:
        candidate_keys.append(normalized_preferred_key)
    for fallback_key in fallback_keys:
        if fallback_key not in candidate_keys:
            candidate_keys.append(fallback_key)

    for key in candidate_keys:
        if key not in payload:
            continue
        value = payload.get(key)
        text_value = _coerce_text_value(value).strip()
        if text_value:
            return text_value

    return ""


def _sanitize_headers(request: Request, *, extra_hidden_names: set[str] | None = None) -> dict[str, str]:
    hidden_names = {"authorization", "cookie", "set-cookie"}
    if extra_hidden_names:
        hidden_names.update(name.lower() for name in extra_hidden_names if name)
    sanitized: dict[str, str] = {}
    for key, value in request.headers.items():
        if key.lower() in hidden_names:
            continue
        sanitized[key] = value
    return sanitized


def _set_multi_value(container: dict[str, object], key: str, value: object) -> None:
    if key not in container:
        container[key] = value
        return
    current_value = container[key]
    if isinstance(current_value, list):
        current_value.append(value)
        return
    container[key] = [current_value, value]


def _extract_secret_value(value: object) -> str:
    if isinstance(value, list):
        return _extract_secret_value(value[0] if value else "")
    return str(value or "")


def apply_runtime_post_input(
    graph,
    *,
    input_text: str | None,
    input_metadata: dict | None,
    input_files: list[dict[str, object]] | None = None,
    merge_metadata: bool = False,
    target_node_id: str | None = None,
):
    if input_text is None and input_metadata is None and not input_files:
        return graph

    updated_graph = graph.model_copy(deep=True)
    candidate_inputs = [
        node
        for node in updated_graph.nodes
        if node.type == NodeType.INPUT or node.type in QUEUE_INPUT_NODE_TYPES
    ]
    if target_node_id:
        input_node = next((node for node in candidate_inputs if node.id == target_node_id), None)
    else:
        input_node = next((node for node in candidate_inputs if node.type == NodeType.INPUT), None)
        if input_node is None:
            input_node = candidate_inputs[0] if candidate_inputs else None

    if input_node is None:
        return updated_graph

    extras = dict(input_node.data.extras or {})
    if input_text is not None:
        extras["inputText"] = input_text
        if str(extras.get("inputMode") or "text") != "file":
            input_node.data.prompt = input_text

    if input_metadata is not None or input_files:
        next_metadata = dict(input_metadata or {})
        if merge_metadata:
            existing_metadata = {}
            payload_json_raw = str(extras.get("payloadJson") or "").strip()
            if payload_json_raw:
                try:
                    parsed_metadata = json.loads(payload_json_raw)
                except json.JSONDecodeError:
                    parsed_metadata = None
                if isinstance(parsed_metadata, dict):
                    existing_metadata = parsed_metadata
            next_metadata = {
                **existing_metadata,
                **next_metadata,
            }

        if input_files:
            next_metadata["_agnolab_runtime_files"] = input_files

        extras["payloadJson"] = json.dumps(next_metadata, ensure_ascii=False)
        if "hitl_auto_approve" in next_metadata:
            extras["hitlAutoApprove"] = "true" if bool(next_metadata["hitl_auto_approve"]) else "false"
        else:
            extras["hitlAutoApprove"] = ""

        hitl_user_input = next_metadata.get("hitl_user_input")
        if isinstance(hitl_user_input, dict):
            extras["hitlUserInputJson"] = json.dumps(hitl_user_input, ensure_ascii=False, indent=2)
        else:
            extras["hitlUserInputJson"] = ""

    input_node.data.extras = extras
    return updated_graph


def apply_runtime_debug_flag(graph, *, debug: bool):
    updated_graph = graph.model_copy(deep=True)
    for node in updated_graph.nodes:
        if node.type not in {NodeType.AGENT, NodeType.TEAM}:
            continue
        extras = dict(node.data.extras or {})
        agent_config = extras.get("agentConfig") or {}
        if not isinstance(agent_config, dict):
            agent_config = {}
        agent_config["debug_mode"] = debug
        extras["agentConfig"] = agent_config
        node.data.extras = extras
    return updated_graph


def extract_agent_response(stdout: str) -> str:
    filtered_lines = []
    for line in stdout.splitlines():
        if line.startswith("[debug]") or line.startswith("DEBUG"):
            continue
        filtered_lines.append(line)

    compacted: list[str] = []
    for line in filtered_lines:
        is_blank = line.strip() == ""
        previous_blank = bool(compacted and compacted[-1].strip() == "")
        if is_blank and previous_blank:
            continue
        compacted.append(line)
    cleaned = "\n".join(compacted).strip()
    cleaned = re.sub(r"<additional_information>[\s\S]*?</additional_information>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(
        r"Runtime input context available to this flow:[\s\S]*?(?=(You have the capability to retain memories|$))",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"You have the capability to retain memories[\s\S]*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def extract_tagged_flow_result(stdout: str) -> tuple[str, str]:
    pattern = re.compile(
        rf"{re.escape(RESULT_START_MARKER)}\s*\n?(.*?)\n?{re.escape(RESULT_END_MARKER)}",
        flags=re.DOTALL,
    )
    match = pattern.search(stdout)
    if not match:
        return "", stdout

    clean_stdout = match.group(1).strip()
    stripped_stdout = pattern.sub(clean_stdout, stdout, count=1).strip()
    return clean_stdout, stripped_stdout


def run_saved_flow_record(
    record: FlowRecord,
    *,
    input_text: str | None,
    input_metadata: dict | None,
    input_files: list[dict[str, object]] | None = None,
    debug: bool,
    merge_metadata: bool = False,
    target_input_node_id: str | None = None,
    runtime_source: str = "manual",
    track_runtime_activity: bool = False,
) -> RunResult:
    started_at = time.perf_counter()
    if track_runtime_activity:
        _record_flow_runtime_start(record.name, source=runtime_source)

    run_result: RunResult | None = None
    try:
        graph = apply_runtime_post_input(
            record.graph,
            input_text=input_text,
            input_metadata=input_metadata,
            input_files=input_files,
            merge_metadata=merge_metadata,
            target_node_id=target_input_node_id,
        )
        if debug is False:
            graph = apply_runtime_debug_flag(graph, debug=False)

        code, warnings = compile_graph(graph)
        success, stdout, stderr, exit_code = run_generated_code(
            code,
            extra_env=get_graph_runtime_env(graph),
            timeout_seconds=get_graph_execution_timeout_seconds(graph),
        )

        tagged_clean_stdout, stripped_stdout = extract_tagged_flow_result(stdout)
        response_stdout = stripped_stdout or stdout
        clean_stdout = tagged_clean_stdout or extract_agent_response(stdout)
        response_code = code
        response_warnings = warnings
        if debug is False:
            response_stdout = clean_stdout
            response_code = ""
            response_warnings = []

        run_result = RunResult(
            success=success,
            stdout=response_stdout,
            clean_stdout=clean_stdout,
            stderr=stderr,
            exit_code=exit_code,
            code=response_code,
            warnings=response_warnings,
        )
        return run_result
    finally:
        if track_runtime_activity:
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            success_value = bool(run_result.success) if run_result is not None else False
            error_value: str | None = None
            if run_result is not None and not run_result.success:
                error_value = (run_result.stderr or run_result.stdout or "").strip() or None
            _record_flow_runtime_finish(
                record.name,
                source=runtime_source,
                success=success_value,
                duration_ms=duration_ms,
                error=error_value,
            )


def run_saved_flow_from_email_event(flow_name: str, email_event: dict[str, str]) -> tuple[bool, str | None]:
    record = load_flow_record(flow_name)
    if record is None:
        return False, f"Flow not found: {flow_name}"

    run_result = run_saved_flow_record(
        record,
        input_text=email_event.get("text"),
        input_metadata={
            "_agnolab_email_listener_event": email_event,
            "email_listener_source": "background_listener",
        },
        input_files=None,
        debug=False,
        merge_metadata=True,
        runtime_source="email_listener",
        track_runtime_activity=True,
    )
    summary = run_result.clean_stdout or run_result.stderr or run_result.stdout
    return run_result.success, summary or None


def run_saved_flow_from_queue_event(
    flow_name: str,
    node_id: str,
    payload_text: str,
    payload_metadata: dict[str, object] | None,
) -> tuple[bool, str | None]:
    record = load_flow_record(flow_name)
    if record is None:
        return False, f"Flow not found: {flow_name}"

    run_result = run_saved_flow_record(
        record,
        input_text=payload_text,
        input_metadata={
            "_agnolab_queue_event": {
                "text": payload_text,
                "metadata": payload_metadata or {},
                "node_id": node_id,
            },
            "queue_listener_source": "background_subscriber",
            **(payload_metadata or {}),
        },
        input_files=None,
        debug=False,
        merge_metadata=True,
        target_input_node_id=node_id,
        runtime_source="queue_subscriber",
        track_runtime_activity=True,
    )
    summary = run_result.clean_stdout or run_result.stderr or run_result.stdout
    if run_result.success and summary:
        dispatch_errors = _dispatch_queue_output_payloads(
            record.graph,
            payload_text=summary,
            target_input_node_id=node_id,
        )
        if dispatch_errors:
            return False, " | ".join(dispatch_errors)
    return run_result.success, summary or None


@app.api_route("/api/integrations/webhook/{flow_name}/{node_id}", methods=["POST", "PUT", "PATCH"], response_model=RunResult)
async def run_saved_flow_from_webhook(flow_name: str, node_id: str, request: Request, debug: bool = False) -> RunResult:
    record = load_flow_record(flow_name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {flow_name}")
    require_flow_bearer_auth(record, request)

    input_node = _find_saved_input_node(record, node_id=node_id, expected_source="webhook")
    extras = input_node.data.extras if isinstance(input_node.data.extras, dict) else {}

    shared_secret = str(extras.get("webhookSecret") or "")
    secret_header = str(extras.get("webhookSecretHeader") or "X-AgnoLab-Secret").strip() or "X-AgnoLab-Secret"
    if shared_secret and request.headers.get(secret_header) != shared_secret:
        raise HTTPException(status_code=401, detail=f"Invalid webhook secret in header '{secret_header}'.")

    body_bytes = await request.body()
    raw_text = body_bytes.decode("utf-8", errors="replace")
    parsed_json = _parse_json_text(raw_text)
    preferred_text_field = str(extras.get("webhookTextField") or "message")
    resolved_text = _pick_mapping_value(parsed_json, preferred_text_field, ["message", "text", "prompt", "body", "input"])
    if not resolved_text:
        resolved_text = raw_text.strip()

    metadata_payload: dict[str, object] = {
        "integration_source": "webhook",
        "webhook_method": request.method,
        "webhook_path": request.url.path,
        "webhook_query": dict(request.query_params),
        "webhook_headers": _sanitize_headers(request, extra_hidden_names={secret_header}),
        "webhook_content_type": request.headers.get("content-type", ""),
    }
    if parsed_json is not None:
        metadata_payload["webhook_json"] = parsed_json
    elif raw_text.strip():
        metadata_payload["webhook_body"] = raw_text

    metadata_payload["_agnolab_webhook_event"] = {
        "text": resolved_text,
    }

    return run_saved_flow_record(
        record,
        input_text=resolved_text or None,
        input_metadata=metadata_payload,
        input_files=None,
        debug=debug,
        merge_metadata=True,
        runtime_source="webhook",
        track_runtime_activity=True,
    )


@app.post("/api/integrations/form/{flow_name}/{node_id}", response_model=RunResult)
async def run_saved_flow_from_form(flow_name: str, node_id: str, request: Request, debug: bool = False) -> RunResult:
    record = load_flow_record(flow_name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {flow_name}")
    require_flow_bearer_auth(record, request)

    input_node = _find_saved_input_node(record, node_id=node_id, expected_source="form")
    extras = input_node.data.extras if isinstance(input_node.data.extras, dict) else {}
    form_payload = await request.form()

    fields: dict[str, object] = {}
    files: list[dict[str, object]] = []
    for key, value in form_payload.multi_items():
        if isinstance(value, StarletteUploadFile):
            file_bytes = await value.read()
            files.append(
                {
                    "name": value.filename or key or "upload.bin",
                    "alias": value.filename or key or "upload.bin",
                    "mime_type": value.content_type or "application/octet-stream",
                    "encoding": "base64",
                    "base64": base64.b64encode(file_bytes).decode("ascii"),
                    "field_name": key,
                }
            )
        else:
            _set_multi_value(fields, key, str(value))

    form_secret = str(extras.get("formSecret") or "")
    form_secret_header = str(extras.get("formSecretHeader") or "X-AgnoLab-Secret").strip() or "X-AgnoLab-Secret"
    form_secret_field = str(extras.get("formSecretField") or "_secret").strip() or "_secret"
    provided_secret = request.headers.get(form_secret_header) or _extract_secret_value(fields.get(form_secret_field))
    if form_secret and provided_secret != form_secret:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid form secret. Expected header '{form_secret_header}' or field '{form_secret_field}'.",
        )

    if form_secret_field in fields:
        fields.pop(form_secret_field, None)

    metadata_payload: dict[str, object] = {
        "integration_source": "form",
        "form_path": request.url.path,
        "form_content_type": request.headers.get("content-type", ""),
        "form_headers": _sanitize_headers(request, extra_hidden_names={form_secret_header}),
        "form_fields": fields,
        "form_file_count": len(files),
        "form_file_names": [str(item.get("name") or "") for item in files],
    }

    form_metadata_field = str(extras.get("formMetadataField") or "metadata_json").strip()
    if form_metadata_field and form_metadata_field in fields:
        parsed_metadata = _parse_json_text(_extract_secret_value(fields.pop(form_metadata_field)))
        if isinstance(parsed_metadata, dict):
            metadata_payload.update(parsed_metadata)
        elif parsed_metadata is not None:
            metadata_payload["form_metadata_value"] = parsed_metadata

    preferred_text_field = str(extras.get("formTextField") or "message")
    resolved_text = _pick_mapping_value(fields, preferred_text_field, ["message", "text", "description", "prompt"])

    primary_file_field = str(extras.get("formPrimaryFileField") or "").strip()
    if primary_file_field:
        files.sort(key=lambda item: 0 if str(item.get("field_name") or "") == primary_file_field else 1)

    metadata_payload["_agnolab_form_event"] = {
        "text": resolved_text,
    }

    return run_saved_flow_record(
        record,
        input_text=resolved_text or None,
        input_metadata=metadata_payload,
        input_files=files,
        debug=debug,
        merge_metadata=True,
        runtime_source="form",
        track_runtime_activity=True,
    )


@app.get("/api/integrations/whatsapp/{flow_name}/{node_id}/session/status", response_model=WhatsappSessionStatus)
def get_saved_flow_whatsapp_session_status(flow_name: str, node_id: str) -> WhatsappSessionStatus:
    record = load_flow_record(flow_name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {flow_name}")

    input_node, _extras, session_id, _webhook_secret, webhook_url, gateway = _get_saved_whatsapp_input(record, node_id=node_id)
    try:
        status_payload = gateway.get_session_status(session_id)
        return _build_whatsapp_status_response(record, input_node, status_payload=status_payload, webhook_url=webhook_url)
    except Exception as error:
        return _build_whatsapp_status_response(
            record,
            input_node,
            status_payload={"session_id": session_id, "status": "error", "connected": False, "qr_code": None},
            webhook_url=webhook_url,
            last_error=str(error),
        )


@app.post("/api/integrations/whatsapp/{flow_name}/{node_id}/session/start", response_model=WhatsappSessionStatus)
def start_saved_flow_whatsapp_session(flow_name: str, node_id: str) -> WhatsappSessionStatus:
    record = load_flow_record(flow_name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {flow_name}")

    input_node, _extras, session_id, _webhook_secret, webhook_url, gateway = _get_saved_whatsapp_input(record, node_id=node_id)
    try:
        status_payload = gateway.start_session(session_id, webhook_url=webhook_url)
        return _build_whatsapp_status_response(record, input_node, status_payload=status_payload, webhook_url=webhook_url)
    except Exception as error:
        return _build_whatsapp_status_response(
            record,
            input_node,
            status_payload={"session_id": session_id, "status": "error", "connected": False, "qr_code": None},
            webhook_url=webhook_url,
            last_error=str(error),
        )


@app.post("/api/integrations/whatsapp/{flow_name}/{node_id}/session/stop", response_model=WhatsappSessionStatus)
def stop_saved_flow_whatsapp_session(flow_name: str, node_id: str) -> WhatsappSessionStatus:
    record = load_flow_record(flow_name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {flow_name}")

    input_node, _extras, session_id, _webhook_secret, webhook_url, gateway = _get_saved_whatsapp_input(record, node_id=node_id)
    try:
        gateway.close_session(session_id)
        status_payload = {"session_id": session_id, "status": "closed", "connected": False, "qr_code": None}
        return _build_whatsapp_status_response(record, input_node, status_payload=status_payload, webhook_url=webhook_url)
    except Exception as error:
        return _build_whatsapp_status_response(
            record,
            input_node,
            status_payload={"session_id": session_id, "status": "error", "connected": False, "qr_code": None},
            webhook_url=webhook_url,
            last_error=str(error),
        )


@app.post("/api/integrations/whatsapp/{flow_name}/{node_id}/events", response_model=WhatsappWebhookDispatchResponse)
async def run_saved_flow_from_whatsapp(flow_name: str, node_id: str, request: Request) -> WhatsappWebhookDispatchResponse:
    record = load_flow_record(flow_name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {flow_name}")

    input_node, extras, session_id, webhook_secret, _webhook_url, gateway = _get_saved_whatsapp_input(record, node_id=node_id)
    provided_secret = str(request.query_params.get("secret") or "").strip()
    if webhook_secret and provided_secret != webhook_secret:
        raise HTTPException(status_code=401, detail="Invalid WhatsApp webhook secret.")

    raw_body = await request.body()
    try:
        payload = await request.json()
    except Exception:
        payload = _parse_json_text(raw_body.decode("utf-8", errors="replace")) or {}

    event_name = "message"
    if isinstance(payload, dict):
        event_name = str(payload.get("event") or payload.get("eventName") or payload.get("type") or "message").strip() or "message"

    def _respond(response: WhatsappWebhookDispatchResponse) -> WhatsappWebhookDispatchResponse:
        print(
            "[whatsapp-dispatch] "
            f"flow={flow_name} node={node_id} session={session_id} "
            f"event={response.event or event_name} accepted={response.accepted} replied={response.replied} "
            f"sender={response.sender or ''} reason={response.reason or ''} delivery_error={response.delivery_error or ''}",
            flush=True,
        )
        return response

    if _should_ignore_whatsapp_event(event_name):
        return _respond(WhatsappWebhookDispatchResponse(
            accepted=False,
            connected=True,
            replied=False,
            session_id=session_id,
            event=event_name,
            reason=f"Ignored WhatsApp event '{event_name}' because it is not an inbound message event.",
        ))

    message_event = _extract_whatsapp_message_event(payload)
    if message_event is None:
        return _respond(WhatsappWebhookDispatchResponse(
            accepted=False,
            connected=None,
            replied=False,
            session_id=session_id,
            event=event_name,
            reason="Webhook payload does not contain a supported WhatsApp message event.",
        ))

    if message_event["from_me"]:
        return _respond(WhatsappWebhookDispatchResponse(
            accepted=False,
            connected=True,
            replied=False,
            session_id=session_id,
            event=event_name,
            sender=str(message_event["from"] or ""),
            reason="Outgoing messages from this same WhatsApp session are ignored.",
        ))

    if _normalize_bool(extras.get("whatsappIgnoreGroups"), True) and bool(message_event["is_group"]):
        return _respond(WhatsappWebhookDispatchResponse(
            accepted=False,
            connected=True,
            replied=False,
            session_id=session_id,
            event=event_name,
            sender=str(message_event["from"] or ""),
            reason="Group messages are ignored by this flow configuration.",
        ))

    sender_value = str(message_event["from"] or "")
    sender_name = str(message_event["sender_name"] or "")
    text_value = str(message_event["text"] or "").strip()
    runtime_files = _extract_whatsapp_runtime_files(message_event)

    transcription_text = ""
    if not text_value and runtime_files:
        transcription_text = _transcribe_whatsapp_audio_with_openai(runtime_files)
        if transcription_text:
            text_value = transcription_text

    if not text_value and not runtime_files:
        return _respond(WhatsappWebhookDispatchResponse(
            accepted=False,
            connected=True,
            replied=False,
            session_id=session_id,
            event=event_name,
            sender=sender_value,
            reason="Message has no text body to pass into the flow.",
        ))

    if not _field_matches(sender_value, extras.get("whatsappSenderFilter")) and not _field_matches(sender_name, extras.get("whatsappSenderFilter")):
        return _respond(WhatsappWebhookDispatchResponse(
            accepted=False,
            connected=True,
            replied=False,
            session_id=session_id,
            event=event_name,
            sender=sender_value,
            reason="Message sender does not match the configured WhatsApp filter.",
        ))

    if not _keywords_match(text_value, extras.get("whatsappBodyKeywords")):
        return _respond(WhatsappWebhookDispatchResponse(
            accepted=False,
            connected=True,
            replied=False,
            session_id=session_id,
            event=event_name,
            sender=sender_value,
            reason="Message text does not match the configured WhatsApp keyword filter.",
        ))

    message_id_value = str(message_event["message_id"] or "")
    if _remember_recent_whatsapp_event(record.name, session_id, message_id_value):
        return _respond(WhatsappWebhookDispatchResponse(
            accepted=False,
            connected=True,
            replied=False,
            session_id=session_id,
            event=event_name,
            sender=sender_value,
            reason="Duplicate WhatsApp message event ignored.",
        ))

    whatsapp_metadata: dict[str, object] = {
        "integration_source": "whatsapp",
        "whatsapp_session_id": session_id,
        "whatsapp_from": sender_value,
        "whatsapp_sender_name": sender_name,
        "whatsapp_message_id": message_id_value,
        "whatsapp_timestamp": str(message_event["timestamp"] or ""),
        "whatsapp_is_group": bool(message_event["is_group"]),
        "whatsapp_event_name": event_name,
        "whatsapp": {
            "from": sender_value,
            "sender_name": sender_name,
            "message_id": message_id_value,
            "timestamp": str(message_event["timestamp"] or ""),
            "is_group": bool(message_event["is_group"]),
            "text": text_value,
            "transcription": transcription_text or None,
        },
    }
    metadata_payload: dict[str, object] = {
        **whatsapp_metadata,
        "_agnolab_whatsapp_event": {
            "text": text_value,
            "metadata": whatsapp_metadata,
        },
    }

    run_result = run_saved_flow_record(
        record,
        input_text=text_value or None,
        input_metadata=metadata_payload,
        input_files=runtime_files or None,
        debug=False,
        merge_metadata=True,
        target_input_node_id=input_node.id,
        runtime_source="whatsapp",
        track_runtime_activity=True,
    )

    flow_result_text = (run_result.clean_stdout or run_result.stdout or "").strip()
    reply_enabled = _normalize_bool(extras.get("whatsappReplyEnabled"), True)
    reply_template = str(extras.get("whatsappReplyTemplate") or "$result_text")
    reply_target = _normalize_whatsapp_reply_target(sender_value, is_group=bool(message_event["is_group"]))
    reply_preview = _replace_template_tokens(
        reply_template,
        {
            **metadata_payload,
            "result_text": flow_result_text,
            "input_text": text_value,
            "sender": sender_value,
            "sender_name": sender_name,
            "session_id": session_id,
        },
    ).strip() or flow_result_text

    replied = False
    delivery_error: str | None = None
    if reply_enabled and reply_target and reply_preview:
        try:
            gateway.send_text(
                session_id,
                phone=reply_target,
                message=reply_preview,
                is_group=bool(message_event["is_group"]),
            )
            replied = True
        except Exception as error:
            delivery_error = str(error)

    return _respond(WhatsappWebhookDispatchResponse(
        accepted=True,
        connected=True,
        replied=replied,
        session_id=session_id,
        event=event_name,
        sender=sender_value,
        reason=None if run_result.success else (run_result.stderr or "Flow execution failed."),
        reply_preview=reply_preview or None,
        flow_result=flow_result_text or None,
        delivery_error=delivery_error,
    ))


@app.post("/api/flows/run", response_model=RunResult)
def run_saved_flow_by_name(request: RunSavedFlowByNameRequest, http_request: Request) -> RunResult:
    record = load_flow_record(request.name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {request.name}")
    require_flow_bearer_auth(record, http_request)
    return run_saved_flow_record(
        record,
        input_text=request.input_text,
        input_metadata=request.input_metadata,
        input_files=None,
        debug=request.debug,
    )


@app.post("/api/project/export", response_model=ExportProjectResponse)
def export_code(request: CodegenRequest) -> ExportProjectResponse:
    return export_project(request.graph)
