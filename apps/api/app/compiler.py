from __future__ import annotations

from collections import defaultdict, deque
import json
import re

from jinja2 import Template

from .models import CanvasGraph, GraphNode, NodeType, TargetRuntime
from .provider_catalog import get_provider_definition, normalize_provider_id, render_provider_model_expression

AGENT_TEMPLATE = Template(
    """{{ var_name }} = Agent(
{{ kwargs }}
)"""
)

TEAM_TEMPLATE = Template(
    """{{ var_name }} = Team(
    name={{ name|tojson }},
    members=[{{ members|join(", ") }}],
    instructions={{ instructions|tojson }},
)
"""
)

TOOL_TEMPLATE = Template(
    """def {{ var_name }}(value: str) -> str:
    return f"[{{ label }}] {value}"
"""
)

HEADER_TEMPLATE = Template(
    """import base64
import json
import os
from pathlib import Path

from agno.agent import Agent
from agno.team import Team

"""
)

DEBUG_TRACE_HELPERS = [
    "def _agnolab_run_with_debug(runner, flow_input):",
    '    debug_enabled = bool(getattr(runner, "debug_mode", False))',
    '    stream_enabled = bool(getattr(runner, "stream_events", False))',
    '    run_output = runner.run(flow_input, debug_mode=debug_enabled, stream_events=stream_enabled)',
    '    if hasattr(run_output, "content"):',
    "        return run_output",
    "    final_output = None",
    "    for item in run_output:",
    '        if not hasattr(item, "event"):',
    "            final_output = item",
    "    return final_output",
    "",
]

RAW_AGENT_FIELDS = {
    "db",
    "memory_manager",
    "session_summary_manager",
    "compression_manager",
    "knowledge",
    "knowledge_retriever",
    "tool_hooks",
    "pre_hooks",
    "post_hooks",
    "reasoning_model",
    "reasoning_agent",
    "input_schema",
    "output_schema",
    "parser_model",
    "output_model",
}

JSON_AGENT_FIELDS = {
    "session_state",
    "dependencies",
    "knowledge_filters",
    "tool_choice",
    "additional_input",
    "events_to_skip",
    "metadata",
}

def sanitize_identifier(value: str) -> str:
    cleaned = "".join(char if char.isalnum() else "_" for char in value.lower())
    cleaned = cleaned.strip("_")
    return cleaned or "node"


def topological_nodes(graph: CanvasGraph) -> list[GraphNode]:
    indegree = {node.id: 0 for node in graph.nodes}
    adjacency: dict[str, list[str]] = defaultdict(list)

    for edge in graph.edges:
        adjacency[edge.source].append(edge.target)
        indegree[edge.target] = indegree.get(edge.target, 0) + 1

    node_map = {node.id: node for node in graph.nodes}
    queue = deque([node_id for node_id, degree in indegree.items() if degree == 0])
    ordered: list[GraphNode] = []

    while queue:
        node_id = queue.popleft()
        node = node_map.get(node_id)
        if node is None:
            continue
        ordered.append(node)
        for target in adjacency.get(node_id, []):
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)

    if len(ordered) != len(graph.nodes):
        return graph.nodes

    return ordered


def incoming_ids(graph: CanvasGraph, node_id: str) -> list[str]:
    return [edge.source for edge in graph.edges if edge.target == node_id]


def python_literal(value):
    return repr(value)


def get_node_provider_config(node: GraphNode) -> dict[str, object]:
    extras = node.data.extras or {}
    provider_config = extras.get("providerConfig") or {}
    if isinstance(provider_config, dict):
        return provider_config
    return {}


def get_node_provider_id(node: GraphNode) -> str:
    provider_config = get_node_provider_config(node)
    provider_value = node.data.provider or provider_config.get("provider_profile") or ""
    return normalize_provider_id(str(provider_value))


def build_provider_env_setup(node: GraphNode) -> list[str]:
    provider_config = get_node_provider_config(node)
    definition = get_provider_definition(get_node_provider_id(node))

    api_key_env_var = str(provider_config.get("provider_api_key_env") or (definition.api_key_env if definition else "") or "").strip()
    api_key_value = str(provider_config.get("provider_api_key") or "").strip()
    base_url_env_var = str(provider_config.get("provider_base_url_env") or (definition.base_url_env if definition else "") or "").strip()
    base_url_value = str(provider_config.get("provider_base_url") or "").strip()
    extra_env_raw = provider_config.get("provider_env_json")

    lines: list[str] = []
    if api_key_env_var and api_key_value:
        lines.append(f"os.environ[{python_literal(api_key_env_var)}] = {python_literal(api_key_value)}")
    if base_url_env_var and base_url_value:
        lines.append(f"os.environ[{python_literal(base_url_env_var)}] = {python_literal(base_url_value)}")

    if isinstance(extra_env_raw, str) and extra_env_raw.strip():
        parsed = parse_json_if_needed(extra_env_raw)
        if isinstance(parsed, dict):
            for key, value in parsed.items():
                if value in (None, ""):
                    continue
                lines.append(f"os.environ[{python_literal(str(key))}] = {python_literal(str(value))}")

    return lines


def parse_json_if_needed(raw_value: str):
    try:
        return json.loads(raw_value)
    except json.JSONDecodeError:
        return raw_value


def collect_provider_imports(graph: CanvasGraph, ordered_nodes: list[GraphNode]) -> tuple[list[str], dict[str, str], list[str]]:
    provider_definitions: list[tuple[str, object]] = []
    provider_ids: set[str] = set()
    provider_import_lines: list[str] = []
    provider_class_refs: dict[str, str] = {}
    warnings: list[str] = []

    for node in ordered_nodes:
        if node.type != NodeType.AGENT:
            continue

        provider_id = get_node_provider_id(node)
        if not provider_id:
            continue

        definition = get_provider_definition(provider_id)
        if definition is None or definition.id in provider_ids:
            continue

        provider_definitions.append((definition.id, definition))
        provider_ids.add(definition.id)

    class_name_counts: dict[str, int] = defaultdict(int)
    for _, definition in provider_definitions:
        class_name_counts[definition.class_name] += 1

    seen_imports: set[tuple[str, str, str]] = set()
    for provider_id, definition in provider_definitions:
        import_ref = definition.import_alias or definition.class_name
        if class_name_counts[definition.class_name] > 1 and not definition.import_alias:
            import_ref = sanitize_identifier(f"{provider_id}_{definition.class_name}")
        provider_class_refs[provider_id] = import_ref

        import_key = (definition.module, definition.class_name, import_ref)
        if import_key in seen_imports:
            continue
        seen_imports.add(import_key)
        if import_ref == definition.class_name:
            provider_import_lines.append(f"from {definition.module} import {definition.class_name}")
        else:
            provider_import_lines.append(f"from {definition.module} import {definition.class_name} as {import_ref}")

    return provider_import_lines, provider_class_refs, warnings


def normalize_function_tool_code(function_name: str, raw_code: str) -> str:
    code = (raw_code or "").strip()
    if not code:
        return f"""@tool
def {function_name}(value: str) -> str:
    return value
"""

    if "@tool" in code:
        return code

    if "def " in code:
        return f"@tool\n{code}"

    return f"""@tool
def {function_name}(value: str) -> str:
{code}
"""


def extract_function_name(raw_code: str, fallback: str) -> str:
    match = re.search(r"def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(", raw_code)
    if match:
        return match.group(1)
    return fallback


def render_tool_node(node: GraphNode, var_name: str) -> tuple[list[str], list[tuple[str, str]], bool]:
    extras = node.data.extras or {}
    tool_mode = extras.get("toolMode", "builtin")

    if tool_mode == "builtin":
        class_name = extras.get("builtinClassName", "WebSearchTools")
        import_path = extras.get("builtinImportPath", "agno.tools.websearch")
        config_raw = extras.get("builtinConfig") or ""
        kwargs = ""
        if isinstance(config_raw, str) and config_raw.strip():
            parsed = parse_json_if_needed(config_raw)
            if isinstance(parsed, dict) and parsed:
                kwargs = ", ".join(f"{key}={python_literal(value)}" for key, value in parsed.items())
        expression = f"{class_name}({kwargs})" if kwargs else f"{class_name}()"
        return [f"{var_name} = {expression}", ""], [(import_path, class_name)], False

    function_name = sanitize_identifier(str(extras.get("functionName") or node.data.name or var_name))
    function_code = normalize_function_tool_code(function_name, str(extras.get("functionCode") or ""))
    extracted_name = extract_function_name(function_code, function_name)
    lines = [function_code.rstrip(), f"{var_name} = {extracted_name}", ""]
    return lines, [], True


def build_runtime_input_guidance() -> str:
    return """
Runtime input context available to this flow:
- `flow_input`: formatted string with the user text, attached files and metadata.
- `flow_input_payload`: dict with keys `text`, `files` and `metadata`.
- `flow_input_files`: list of attached files with `name`, `alias`, `mime_type` and `path`.
- `flow_input_file_path`: absolute path to the first attached file, or `None`.
- `flow_input_metadata`: dict parsed from the input metadata JSON.

When you use tools:
- If a tool needs a file path, prefer `flow_input_file_path`.
- If there are multiple files, inspect `flow_input_files`.
- If the user attached a CSV, pass the file path explicitly to the tool.
- Mention when you are relying on attached files versus plain text input.
- If a tool returns `numeric_summary` or `financial_summary`, use those exact totals in the final answer.
- Do not estimate, infer, or recompute totals from preview rows when a tool already returned aggregate values.
""".strip()


def merge_instruction_blocks(*blocks: str | None) -> str:
    return "\n\n".join(block.strip() for block in blocks if block and block.strip())


def build_agent_kwargs(node: GraphNode, tool_symbols: list[str], provider_class_ref: str | None = None) -> tuple[str, list[str]]:
    extras = node.data.extras or {}
    agent_config = extras.get("agentConfig") or {}
    if not isinstance(agent_config, dict):
        agent_config = {}

    base_instructions = node.data.instructions or "Assist the user clearly and accurately."
    instructions = merge_instruction_blocks(base_instructions, build_runtime_input_guidance())

    provider_config = get_node_provider_config(node)
    model_expr, _, model_warnings = render_provider_model_expression(
        provider_id=get_node_provider_id(node),
        model_name=node.data.model or "gpt-4.1-mini",
        temperature=node.data.temperature,
        provider_config=provider_config,
        class_ref=provider_class_ref,
    )

    ordered_pairs: list[tuple[str, str]] = [
        ("name", python_literal(node.data.name)),
        ("model", model_expr),
        ("instructions", python_literal(instructions)),
    ]

    if tool_symbols:
        ordered_pairs.append(("tools", f"[{', '.join(tool_symbols)}]"))

    if node.data.description:
        ordered_pairs.append(("description", python_literal(node.data.description)))

    for key, value in agent_config.items():
        if key in {"name", "model", "instructions", "description"}:
            continue
        if value in (None, "", [], {}):
            continue
        if key in RAW_AGENT_FIELDS:
            ordered_pairs.append((key, str(value)))
            continue
        if key in JSON_AGENT_FIELDS and isinstance(value, str):
            parsed = parse_json_if_needed(value)
            ordered_pairs.append((key, python_literal(parsed)))
            continue
        ordered_pairs.append((key, python_literal(value)))

    return "\n".join(f"    {key}={value}," for key, value in ordered_pairs), model_warnings


def render_input_payload(node: GraphNode) -> list[str]:
    extras = node.data.extras or {}
    input_text = str(extras.get("inputText") or node.data.prompt or "")
    attached_file_name = str(extras.get("attachedFileName") or "")
    attached_file_alias = str(extras.get("attachedFileAlias") or attached_file_name or "")
    attached_file_mime_type = str(extras.get("attachedFileMimeType") or "text/plain")
    attached_file_encoding = str(extras.get("attachedFileEncoding") or "base64")
    attached_file_base64 = str(extras.get("attachedFileBase64") or "")
    attached_file_content = str(extras.get("attachedFileContent") or "")
    payload_json_raw = str(extras.get("payloadJson") or "").strip()

    metadata_payload = {}
    if payload_json_raw:
        parsed_metadata = parse_json_if_needed(payload_json_raw)
        if isinstance(parsed_metadata, dict):
            metadata_payload = parsed_metadata

    lines = [
        "flow_input_files = []",
        f"flow_input_metadata = {python_literal(metadata_payload)}",
    ]

    if attached_file_name and (attached_file_base64 or attached_file_content):
        lines.extend(
            [
                f"_input_file_name = {python_literal(attached_file_name)}",
                f"_input_file_alias = {python_literal(attached_file_alias)}",
                f"_input_file_mime_type = {python_literal(attached_file_mime_type)}",
                f"_input_file_encoding = {python_literal(attached_file_encoding)}",
                f"_input_file_base64 = {python_literal(attached_file_base64)}",
                f"_input_file_content = {python_literal(attached_file_content)}",
                "_input_file_path = Path(_input_file_name)",
                "if _input_file_base64:",
                "    _input_file_path.write_bytes(base64.b64decode(_input_file_base64))",
                "else:",
                "    _input_file_path.write_text(_input_file_content, encoding='utf-8')",
                "flow_input_files.append({",
                "    'name': _input_file_name,",
                "    'alias': _input_file_alias,",
                "    'mime_type': _input_file_mime_type,",
                "    'encoding': _input_file_encoding,",
                "    'path': str(_input_file_path.resolve()),",
                "})",
            ]
        )
    else:
        lines.append("flow_input_files = []")

    lines.extend(
        [
            f"flow_input_payload = {{'text': {python_literal(input_text)}, 'files': flow_input_files, 'metadata': flow_input_metadata}}",
            "flow_input_file_path = flow_input_files[0]['path'] if flow_input_files else None",
            "flow_input_parts = []",
            "if flow_input_payload.get('text'):",
            "    flow_input_parts.append(f\"User input:\\n{flow_input_payload['text']}\")",
            "if flow_input_files:",
            "    file_lines = [f\"- {item.get('alias') or item.get('name')} ({item.get('mime_type') or 'unknown'}) at {item.get('path')}\" for item in flow_input_files]",
            "    flow_input_parts.append(\"Attached files:\\n\" + \"\\n\".join(file_lines))",
            "if flow_input_metadata:",
            "    flow_input_parts.append(\"Payload metadata:\\n\" + json.dumps(flow_input_metadata, ensure_ascii=False, indent=2))",
            "flow_input = \"\\n\\n\".join(flow_input_parts) if flow_input_parts else json.dumps(flow_input_payload, ensure_ascii=False)",
        ]
    )

    return lines


def render_output_api_dispatch(node: GraphNode, *, project_name: str) -> tuple[list[str], list[str]]:
    extras = node.data.extras or {}
    warnings: list[str] = []

    api_url = str(extras.get("apiUrl") or "").strip()
    bearer_token = str(extras.get("apiBearerToken") or "").strip()
    timeout_raw = extras.get("apiTimeoutSeconds")
    timeout_seconds = 15.0
    if timeout_raw not in (None, ""):
        try:
            timeout_seconds = float(timeout_raw)
        except (TypeError, ValueError):
            warnings.append("API Output timeout is invalid; falling back to 15 seconds.")
            timeout_seconds = 15.0
    if timeout_seconds <= 0:
        warnings.append("API Output timeout must be greater than zero; falling back to 15 seconds.")
        timeout_seconds = 15.0

    headers_dict: dict[str, object] = {}
    headers_raw = str(extras.get("apiHeadersJson") or "").strip()
    if headers_raw:
        parsed_headers = parse_json_if_needed(headers_raw)
        if isinstance(parsed_headers, dict):
            headers_dict = {str(key): value for key, value in parsed_headers.items()}
        else:
            warnings.append("API Output additional headers JSON is invalid; ignoring custom headers.")

    payload_dict: dict[str, object] = {}
    payload_raw = str(extras.get("apiPayloadJson") or "").strip()
    if payload_raw:
        parsed_payload = parse_json_if_needed(payload_raw)
        if isinstance(parsed_payload, dict):
            payload_dict = parsed_payload
        else:
            warnings.append("API Output additional payload JSON is invalid; ignoring extra payload.")

    lines = [
        f"_agnolab_api_url = {python_literal(api_url)}",
        f"_agnolab_api_bearer_token = {python_literal(bearer_token)}",
        f"_agnolab_api_timeout = {timeout_seconds}",
        f"_agnolab_api_extra_headers = {python_literal(headers_dict)}",
        f"_agnolab_api_extra_payload = {python_literal(payload_dict)}",
        "if not _agnolab_api_url:",
        "    print(flow_result_text)",
        "else:",
        "    _agnolab_api_headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}",
        "    if _agnolab_api_extra_headers:",
        "        _agnolab_api_headers.update(_agnolab_api_extra_headers)",
        "    if _agnolab_api_bearer_token:",
        "        _agnolab_api_headers['Authorization'] = f\"Bearer {_agnolab_api_bearer_token}\"",
        "",
        "    _agnolab_api_payload = {",
        "        'success': True,",
        "        'data': {",
        f"            'flow': {{'project': {python_literal(project_name)}, 'node': {python_literal(node.data.name)}, 'type': 'output_api'}},",
        "            'input': flow_input_payload,",
        "            'result': {'text': flow_result_text},",
        "        },",
        "        'meta': {'source': 'agnolab', 'timestamp': datetime.now(timezone.utc).isoformat()},",
        "    }",
        "    if _agnolab_api_extra_payload:",
        "        _agnolab_api_payload['extra'] = _agnolab_api_extra_payload",
        "",
        "    try:",
        "        _agnolab_api_response = requests.post(",
        "            _agnolab_api_url,",
        "            headers=_agnolab_api_headers,",
        "            json=_agnolab_api_payload,",
        "            timeout=_agnolab_api_timeout,",
        "        )",
        "        try:",
        "            _agnolab_api_response_body = _agnolab_api_response.json()",
        "        except ValueError:",
        "            _agnolab_api_response_body = _agnolab_api_response.text",
        "",
        "        _agnolab_delivery = {",
        "            'delivered': _agnolab_api_response.ok,",
        "            'status_code': _agnolab_api_response.status_code,",
        "            'response': _agnolab_api_response_body,",
        "        }",
        "    except Exception as exc:",
        "        _agnolab_delivery = {'delivered': False, 'error': str(exc)}",
        "",
        "    print(json.dumps({'result': flow_result_text, 'delivery': _agnolab_delivery}, ensure_ascii=False))",
    ]

    if not api_url:
        warnings.append("API Output node has no URL configured; execution will only print the generated result.")

    return lines, warnings


def compile_graph(graph: CanvasGraph) -> tuple[str, list[str]]:
    warnings: list[str] = []

    if graph.project.target != TargetRuntime.AGNO_PYTHON:
        warnings.append("Target different from agno-python is not implemented yet; using agno-python preview.")

    ordered_nodes = topological_nodes(graph)
    node_map = {node.id: node for node in graph.nodes}
    provider_import_lines, provider_class_refs, provider_warnings = collect_provider_imports(graph, ordered_nodes)
    warnings.extend(provider_warnings)
    has_output_api = any(node.type == NodeType.OUTPUT_API for node in ordered_nodes)
    lines: list[str] = []
    import_lines: list[str] = [HEADER_TEMPLATE.render().rstrip()]
    tool_imports: set[tuple[str, str]] = set()
    needs_tool_decorator = False
    symbol_map: dict[str, str] = {}

    for node in ordered_nodes:
        var_name = sanitize_identifier(f"{node.type.value}_{node.id}")
        symbol_map[node.id] = var_name

        if node.type == NodeType.TOOL:
            tool_lines, node_imports, needs_decorator = render_tool_node(node, var_name)
            tool_imports.update(node_imports)
            needs_tool_decorator = needs_tool_decorator or needs_decorator
            lines.extend(tool_lines)
            continue

        if node.type == NodeType.AGENT:
            provider_id = get_node_provider_id(node)
            tool_symbols = [
                symbol_map[source_id]
                for source_id in incoming_ids(graph, node.id)
                if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.TOOL
            ]
            env_setup_lines = build_provider_env_setup(node)
            if env_setup_lines:
                lines.extend(env_setup_lines)
            provider_class_ref = provider_class_refs.get(provider_id)
            agent_kwargs, agent_warnings = build_agent_kwargs(node, tool_symbols, provider_class_ref)
            warnings.extend(agent_warnings)
            lines.append(
                AGENT_TEMPLATE.render(
                    var_name=var_name,
                    kwargs=agent_kwargs,
                ).rstrip()
            )
            lines.append("")
            continue

        if node.type == NodeType.TEAM:
            member_symbols = [
                symbol_map[source_id]
                for source_id in incoming_ids(graph, node.id)
                if source_id in symbol_map
                and node_map.get(source_id)
                and node_map[source_id].type in {NodeType.AGENT, NodeType.TEAM}
            ]
            lines.append(
                TEAM_TEMPLATE.render(
                    var_name=var_name,
                    name=node.data.name,
                    members=member_symbols,
                    instructions=merge_instruction_blocks(
                        node.data.instructions or "Coordinate the team execution.",
                        build_runtime_input_guidance(),
                    ),
                ).rstrip()
            )
            lines.append("")
            continue

    if needs_tool_decorator:
        import_lines.append("from agno.tools import tool")
    import_lines.extend(provider_import_lines)
    for import_path, class_name in sorted(tool_imports):
        import_lines.append(f"from {import_path} import {class_name}")
    if has_output_api:
        import_lines.append("from datetime import datetime, timezone")
        import_lines.append("import requests")
    import_lines.append("")
    lines.extend(DEBUG_TRACE_HELPERS)

    input_nodes = [node for node in ordered_nodes if node.type == NodeType.INPUT]
    terminal_nodes = [
        node for node in ordered_nodes if node.type in {NodeType.OUTPUT, NodeType.OUTPUT_API}
    ]

    if not input_nodes:
        warnings.append("No input node found; preview uses a default prompt string.")
        lines.append('flow_input = "Explain what this flow does."')
        lines.append("flow_input_payload = {'text': flow_input, 'files': [], 'metadata': {}}")
        lines.append("flow_input_files = []")
        lines.append("flow_input_file_path = None")
    else:
        lines.extend(render_input_payload(input_nodes[0]))

    lines.append("")

    if terminal_nodes:
        output_node = terminal_nodes[0]
        if len(terminal_nodes) > 1:
            warnings.append("Multiple output nodes found; using the first connected output in topological order.")

        upstream = [
            source_id
            for source_id in incoming_ids(graph, output_node.id)
            if node_map.get(source_id)
            and node_map[source_id].type in {NodeType.INPUT, NodeType.AGENT, NodeType.TEAM, NodeType.TOOL}
        ]

        producer_node = node_map.get(upstream[0]) if upstream else None
        producer_symbol = symbol_map.get(upstream[0]) if upstream else None
        if producer_node and producer_node.type in {NodeType.AGENT, NodeType.TEAM} and producer_symbol:
            lines.append(f"result = _agnolab_run_with_debug({producer_symbol}, flow_input)")
            lines.append("flow_result_text = result.content if result is not None else ''")
        elif producer_node and producer_node.type == NodeType.TOOL and producer_symbol:
            lines.append(f"result = {producer_symbol}(flow_input)")
            lines.append("flow_result_text = str(result) if result is not None else ''")
        elif producer_node and producer_node.type == NodeType.INPUT:
            lines.append("flow_result_text = flow_input")
        else:
            warnings.append("Output node has no valid upstream producer.")
            lines.append("flow_result_text = flow_input")

        if output_node.type == NodeType.OUTPUT_API:
            output_lines, output_warnings = render_output_api_dispatch(output_node, project_name=graph.project.name)
            lines.extend(output_lines)
            warnings.extend(output_warnings)
        else:
            lines.append("print(flow_result_text)")
    else:
        warnings.append("No output node found; preview prints the raw flow input.")
        lines.append("print(flow_input)")

    full_code = "\n".join(import_lines + lines).strip() + "\n"
    return full_code, warnings
