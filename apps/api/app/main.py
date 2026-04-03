from __future__ import annotations

import html
import json
from pathlib import Path
import re

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
import requests

from .builtin_tools import inspect_builtin_tool_functions
from .compiler import compile_graph
from .email_listener import EmailListenerManager
from .executor import run_generated_code
from .exporter import export_project
from .flow_store import list_flow_summaries, load_flow_record, save_flow_record
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
    ExportProjectResponse,
    FlowRecord,
    ListFlowsResponse,
    RunResult,
    RunSavedFlowByNameRequest,
    SaveFlowRequest,
    SaveFlowResponse,
    SkillPathOption,
)
from .models import NodeType
from .sample_graph import build_sample_graph, get_canvas_template, list_canvas_templates

load_dotenv()

app = FastAPI(title="AgnoLab API", version="0.1.0")

DEFAULT_GENERATED_CODE_TIMEOUT_SECONDS = 20.0
RESULT_START_MARKER = "__AGNO_RESULT_START__"
RESULT_END_MARKER = "__AGNO_RESULT_END__"
PROJECT_ROOT = Path(__file__).resolve().parents[3]
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


@app.on_event("shutdown")
def stop_email_listener_service() -> None:
    email_listener_manager.stop()


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
        openai_api_key=request.credentials.openai_api_key if request.credentials else None,
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


@app.get("/api/integrations/email/listeners", response_model=ListEmailListenerStatusesResponse)
def list_email_listener_statuses(flow_name: str | None = None) -> ListEmailListenerStatusesResponse:
    return ListEmailListenerStatusesResponse(listeners=email_listener_manager.list_statuses(flow_name))


@app.post("/api/flows/save", response_model=SaveFlowResponse)
def save_flow(request: SaveFlowRequest) -> SaveFlowResponse:
    try:
        record = save_flow_record(request.name, request.graph)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    email_listener_manager.sync_saved_flows()

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


def apply_runtime_post_input(
    graph,
    *,
    input_text: str | None,
    input_metadata: dict | None,
    merge_metadata: bool = False,
):
    if input_text is None and input_metadata is None:
        return graph

    updated_graph = graph.model_copy(deep=True)
    input_node = next((node for node in updated_graph.nodes if node.type == NodeType.INPUT), None)
    if input_node is None:
        return updated_graph

    extras = dict(input_node.data.extras or {})
    if input_text is not None:
        extras["inputText"] = input_text
        if str(extras.get("inputMode") or "text") != "file":
            input_node.data.prompt = input_text

    if input_metadata is not None:
        next_metadata = dict(input_metadata)
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
    debug: bool,
    merge_metadata: bool = False,
    openai_api_key: str | None = None,
) -> RunResult:
    graph = apply_runtime_post_input(
        record.graph,
        input_text=input_text,
        input_metadata=input_metadata,
        merge_metadata=merge_metadata,
    )
    if debug is False:
        graph = apply_runtime_debug_flag(graph, debug=False)

    code, warnings = compile_graph(graph)
    success, stdout, stderr, exit_code = run_generated_code(
        code,
        openai_api_key=openai_api_key,
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

    return RunResult(
        success=success,
        stdout=response_stdout,
        clean_stdout=clean_stdout,
        stderr=stderr,
        exit_code=exit_code,
        code=response_code,
        warnings=response_warnings,
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
        debug=False,
        merge_metadata=True,
    )
    summary = run_result.clean_stdout or run_result.stderr or run_result.stdout
    return run_result.success, summary or None


@app.post("/api/flows/run", response_model=RunResult)
def run_saved_flow_by_name(request: RunSavedFlowByNameRequest) -> RunResult:
    record = load_flow_record(request.name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Flow not found: {request.name}")
    return run_saved_flow_record(
        record,
        input_text=request.input_text,
        input_metadata=request.input_metadata,
        debug=request.debug,
        openai_api_key=request.credentials.openai_api_key if request.credentials else None,
    )


@app.post("/api/project/export", response_model=ExportProjectResponse)
def export_code(request: CodegenRequest) -> ExportProjectResponse:
    return export_project(request.graph)
