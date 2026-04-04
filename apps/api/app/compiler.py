from __future__ import annotations

from collections import defaultdict, deque
from inspect import signature
import json
from pathlib import Path
import re

from jinja2 import Template

from .builtin_tools import inspect_builtin_tool_functions
from .models import CanvasGraph, GraphNode, NodeType, TargetRuntime
from .provider_catalog import get_provider_definition, normalize_provider_id, render_provider_model_expression

AGENT_TEMPLATE = Template(
    """{{ var_name }} = Agent(
{{ kwargs }}
)"""
)

TEAM_TEMPLATE = Template(
    """{{ var_name }} = Team(
{{ kwargs }}
)
"""
)

WORKFLOW_TEMPLATE = Template(
    """{{ var_name }} = Workflow(
{{ kwargs }}
)
"""
)

STEP_TEMPLATE = Template(
    """{{ var_name }} = Step(
{{ kwargs }}
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
from agno.media import Audio, File, Image, Video
from agno.team import Team

"""
)

RESULT_START_MARKER = "__AGNO_RESULT_START__"
RESULT_END_MARKER = "__AGNO_RESULT_END__"

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

DEBUG_TRACE_HELPERS = [
    "def _agnolab_build_media_kwargs(flow_input_files):",
    "    media_kwargs = {'images': [], 'audio': [], 'videos': [], 'files': []}",
    "    valid_file_mimes = set(File.valid_mime_types())",
    "    for item in flow_input_files:",
    "        file_path = item.get('path')",
    "        if not file_path:",
    "            continue",
    "        mime_type = str(item.get('mime_type') or '').strip().lower()",
    "        file_name = str(item.get('name') or '')",
    "        file_format = Path(file_name).suffix.lstrip('.').lower() or None",
    "        if mime_type.startswith('image/'):",
    "            media_kwargs['images'].append(Image(filepath=file_path, mime_type=mime_type or None, format=file_format))",
    "            continue",
    "        if mime_type.startswith('audio/'):",
    "            media_kwargs['audio'].append(Audio(filepath=file_path, mime_type=mime_type or None, format=file_format))",
    "            continue",
    "        if mime_type.startswith('video/'):",
    "            media_kwargs['videos'].append(Video(filepath=file_path, mime_type=mime_type or None, format=file_format))",
    "            continue",
    "        file_kwargs = {'filepath': file_path, 'filename': file_name or None, 'format': file_format}",
    "        if mime_type and mime_type in valid_file_mimes:",
    "            file_kwargs['mime_type'] = mime_type",
    "        media_kwargs['files'].append(File(**file_kwargs))",
    "    return {key: value for key, value in media_kwargs.items() if value}",
    "",
    "def _agnolab_run_with_debug(runner, flow_input, media_kwargs=None):",
    '    debug_enabled = bool(getattr(runner, "debug_mode", False))',
    '    stream_enabled = bool(getattr(runner, "stream_events", False))',
    "    media_kwargs = media_kwargs or {}",
    '    run_output = runner.run(flow_input, debug_mode=debug_enabled, stream_events=stream_enabled, **media_kwargs)',
    '    if hasattr(run_output, "content"):',
    "        return run_output",
    "    final_output = None",
    "    for item in run_output:",
    '        if not hasattr(item, "event"):',
    "            final_output = item",
    "    return final_output",
    "",
    "def _agnolab_is_paused_status(status):",
    "    if status is None:",
    "        return False",
    "    normalized = str(getattr(status, 'value', status)).strip().lower()",
    "    return normalized == 'paused'",
    "",
    "def _agnolab_requirement_needs_confirmation(req):",
    "    return bool(getattr(req, 'requires_confirmation', False)) and getattr(req, 'confirmed', None) is None",
    "",
    "def _agnolab_requirement_needs_user_input(req):",
    "    if not bool(getattr(req, 'requires_user_input', False)):",
    "        return False",
    "    current_input = getattr(req, 'user_input', None)",
    "    if isinstance(current_input, dict):",
    "        return len(current_input) == 0",
    "    return current_input is None",
    "",
    "def _agnolab_apply_auto_hitl(step_requirements, flow_input_metadata):",
    "    metadata = flow_input_metadata if isinstance(flow_input_metadata, dict) else {}",
    "    auto_approve = bool(metadata.get('hitl_auto_approve') or metadata.get('auto_approve'))",
    "    if not auto_approve:",
    "        return False, step_requirements",
    "",
    "    auto_user_input = metadata.get('hitl_user_input')",
    "    changed = False",
    "    for req in step_requirements:",
    "        if _agnolab_requirement_needs_confirmation(req):",
    "            req.confirmed = True",
    "            changed = True",
    "        if _agnolab_requirement_needs_user_input(req) and isinstance(auto_user_input, dict):",
    "            req.user_input = auto_user_input",
    "            changed = True",
    "",
    "    return changed, step_requirements",
    "",
    "def _agnolab_run_workflow_with_debug(runner, flow_input, media_kwargs=None):",
    "    flow_input_metadata = {}",
    "    if isinstance(media_kwargs, dict) and '__flow_input_metadata__' in media_kwargs:",
    "        flow_input_metadata = media_kwargs.get('__flow_input_metadata__') or {}",
    "        media_kwargs = {key: value for key, value in media_kwargs.items() if key != '__flow_input_metadata__'}",
    '    stream_enabled = bool(getattr(runner, "stream_events", False))',
    '    stream_run = getattr(runner, "stream", None)',
    "    media_kwargs = media_kwargs or {}",
    '    run_output = runner.run(flow_input, stream=stream_run, stream_events=stream_enabled, **media_kwargs)',
    "    if not hasattr(run_output, 'status'):",
    "        final_output = None",
    "        for item in run_output:",
    "            if not hasattr(item, 'event'):",
    "                final_output = item",
    "        run_output = final_output",
    "",
    "    max_auto_rounds = 5",
    "    if isinstance(flow_input_metadata, dict):",
    "        try:",
    "            max_auto_rounds = max(1, int(flow_input_metadata.get('hitl_auto_max_rounds', 5)))",
    "        except (TypeError, ValueError):",
    "            max_auto_rounds = 5",
    "",
    "    for _ in range(max_auto_rounds):",
    "        if run_output is None or not _agnolab_is_paused_status(getattr(run_output, 'status', None)):",
    "            break",
    "        step_requirements = list(getattr(run_output, 'step_requirements', None) or [])",
    "        if not step_requirements:",
    "            break",
    "        changed, updated_requirements = _agnolab_apply_auto_hitl(step_requirements, flow_input_metadata)",
    "        if not changed:",
    "            break",
    "        try:",
    "            run_output = runner.continue_run(",
    "                run_response=run_output,",
    "                step_requirements=updated_requirements,",
    "                stream=stream_run,",
    "                stream_events=stream_enabled,",
    "            )",
    "        except Exception:",
    "            break",
    "        if not hasattr(run_output, 'status'):",
    "            final_output = None",
    "            for item in run_output:",
    "                if not hasattr(item, 'event'):",
    "                    final_output = item",
    "            run_output = final_output",
    "",
    "    return run_output",
    "",
    "def _agnolab_workflow_result_text(result):",
    "    if result is None:",
    "        return ''",
    "    status = getattr(result, 'status', None)",
    "    if _agnolab_is_paused_status(status):",
    "        paused_step = getattr(result, 'paused_step_name', None) or 'unknown step'",
    "        requirement_notes = []",
    "        for req in list(getattr(result, 'step_requirements', None) or []):",
    "            if bool(getattr(req, 'requires_confirmation', False)) and getattr(req, 'confirmed', None) is None:",
    "                requirement_notes.append('confirmation required')",
    "            if _agnolab_requirement_needs_user_input(req):",
    "                requirement_notes.append('user input required')",
    "            if bool(getattr(req, 'requires_route_selection', False)) and not getattr(req, 'selected_choices', None):",
    "                requirement_notes.append('route selection required')",
    "        notes = ', '.join(requirement_notes) if requirement_notes else 'manual continuation required'",
    "        return f\"Workflow paused at '{paused_step}' ({notes}). Set input metadata `hitl_auto_approve=true` and optional `hitl_user_input` to auto-continue preview.\"",
    "    content = getattr(result, 'content', None)",
    "    return str(content) if content is not None else ''",
    "",
]

RAW_AGENT_FIELDS = {
    "db",
    "memory_manager",
    "session_summary_manager",
    "compression_manager",
    "learning",
    "knowledge",
    "skills",
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

RAW_TEAM_FIELDS = {
    "db",
    "memory_manager",
    "session_summary_manager",
    "compression_manager",
    "learning",
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
    "followup_model",
}

JSON_TEAM_FIELDS = {
    "session_state",
    "dependencies",
    "knowledge_filters",
    "tool_choice",
    "additional_input",
    "events_to_skip",
    "metadata",
}

JSON_WORKFLOW_FIELDS = {
    "session_state",
    "dependencies",
    "events_to_skip",
    "metadata",
}

def get_supported_agent_kwargs() -> set[str]:
    try:
        from agno.agent import Agent as AgnoAgent

        return set(signature(AgnoAgent).parameters)
    except Exception:
        return set()


SUPPORTED_AGENT_KWARGS = get_supported_agent_kwargs()


def get_supported_team_kwargs() -> set[str]:
    try:
        from agno.team import Team as AgnoTeam

        return set(signature(AgnoTeam).parameters)
    except Exception:
        return set()


SUPPORTED_TEAM_KWARGS = get_supported_team_kwargs()


def get_supported_workflow_kwargs() -> set[str]:
    try:
        from agno.workflow import Workflow as AgnoWorkflow

        return set(signature(AgnoWorkflow).parameters)
    except Exception:
        return set()


SUPPORTED_WORKFLOW_KWARGS = get_supported_workflow_kwargs()


def get_supported_step_kwargs() -> set[str]:
    try:
        from agno.workflow import Step as AgnoStep

        return set(signature(AgnoStep).parameters)
    except Exception:
        return set()


SUPPORTED_STEP_KWARGS = get_supported_step_kwargs()


def get_agent_field_aliases() -> dict[str, str]:
    aliases: dict[str, str] = {}

    if "use_instruction_tags" in SUPPORTED_AGENT_KWARGS:
        aliases["add_instruction_tags"] = "use_instruction_tags"
    elif "add_instruction_tags" in SUPPORTED_AGENT_KWARGS:
        aliases["add_instruction_tags"] = "add_instruction_tags"

    if "add_knowledge_to_context" not in SUPPORTED_AGENT_KWARGS and "add_references" in SUPPORTED_AGENT_KWARGS:
        aliases["add_knowledge_to_context"] = "add_references"

    if "references_format" not in SUPPORTED_AGENT_KWARGS and "context_format" in SUPPORTED_AGENT_KWARGS:
        aliases["references_format"] = "context_format"

    return aliases


AGENT_FIELD_ALIASES = get_agent_field_aliases()


def get_team_field_aliases() -> dict[str, str]:
    aliases: dict[str, str] = {}

    if "use_instruction_tags" in SUPPORTED_TEAM_KWARGS:
        aliases["add_instruction_tags"] = "use_instruction_tags"
    elif "add_instruction_tags" in SUPPORTED_TEAM_KWARGS:
        aliases["add_instruction_tags"] = "add_instruction_tags"

    if "add_knowledge_to_context" not in SUPPORTED_TEAM_KWARGS and "add_references" in SUPPORTED_TEAM_KWARGS:
        aliases["add_knowledge_to_context"] = "add_references"

    if "references_format" not in SUPPORTED_TEAM_KWARGS and "context_format" in SUPPORTED_TEAM_KWARGS:
        aliases["references_format"] = "context_format"

    return aliases


TEAM_FIELD_ALIASES = get_team_field_aliases()

KNOWLEDGE_READER_IMPORTS = {
    "pdf": ("agno.knowledge.reader.pdf_reader", "PDFReader"),
    "csv": ("agno.knowledge.reader.csv_reader", "CSVReader"),
    "field_labeled_csv": ("agno.knowledge.reader.field_labeled_csv_reader", "FieldLabeledCSVReader"),
    "excel": ("agno.knowledge.reader.excel_reader", "ExcelReader"),
    "docx": ("agno.knowledge.reader.docx_reader", "DocxReader"),
    "pptx": ("agno.knowledge.reader.pptx_reader", "PPTXReader"),
    "json": ("agno.knowledge.reader.json_reader", "JSONReader"),
    "markdown": ("agno.knowledge.reader.markdown_reader", "MarkdownReader"),
    "text": ("agno.knowledge.reader.text_reader", "TextReader"),
}

RAW_EXPRESSION_IMPORTS = {
    "Knowledge": ("agno.knowledge.knowledge", "Knowledge"),
    "Skills": ("agno.skills", "Skills"),
    "LocalSkills": ("agno.skills", "LocalSkills"),
    "LearningMachine": ("agno.learn", "LearningMachine"),
    "AgentKnowledge": ("agno.agent", "AgentKnowledge"),
    "MemoryManager": ("agno.memory", "MemoryManager"),
    "SessionSummaryManager": ("agno.session.summary", "SessionSummaryManager"),
    "CompressionManager": ("agno.compression.manager", "CompressionManager"),
    "PgVector": ("agno.vectordb.pgvector", "PgVector"),
    "PineconeDb": ("agno.vectordb.pineconedb", "PineconeDb"),
    "Qdrant": ("agno.vectordb.qdrant", "Qdrant"),
    "Weaviate": ("agno.vectordb.weaviate", "Weaviate"),
    "Milvus": ("agno.vectordb.milvus", "Milvus"),
    "ChromaDb": ("agno.vectordb.chroma", "ChromaDb"),
    "LanceDb": ("agno.vectordb.lancedb", "LanceDb"),
    "MongoVectorDb": ("agno.vectordb.mongodb", "MongoVectorDb"),
    "RedisVectorDb": ("agno.vectordb.redis", "RedisVectorDb"),
    "SearchType": ("agno.vectordb.search", "SearchType"),
    "PostgresDb": ("agno.db.postgres", "PostgresDb"),
    "AsyncPostgresDb": ("agno.db.postgres", "AsyncPostgresDb"),
    "SqliteDb": ("agno.db.sqlite", "SqliteDb"),
    "MongoDb": ("agno.db.mongo", "MongoDb"),
    "RedisDb": ("agno.db.redis", "RedisDb"),
    "DynamoDb": ("agno.db.dynamodb", "DynamoDb"),
    "FirestoreDb": ("agno.db.firestore", "FirestoreDb"),
    "PDFReader": ("agno.knowledge.reader.pdf_reader", "PDFReader"),
    "CSVReader": ("agno.knowledge.reader.csv_reader", "CSVReader"),
    "FieldLabeledCSVReader": ("agno.knowledge.reader.field_labeled_csv_reader", "FieldLabeledCSVReader"),
    "ExcelReader": ("agno.knowledge.reader.excel_reader", "ExcelReader"),
    "DocxReader": ("agno.knowledge.reader.docx_reader", "DocxReader"),
    "PPTXReader": ("agno.knowledge.reader.pptx_reader", "PPTXReader"),
    "JSONReader": ("agno.knowledge.reader.json_reader", "JSONReader"),
    "MarkdownReader": ("agno.knowledge.reader.markdown_reader", "MarkdownReader"),
    "TextReader": ("agno.knowledge.reader.text_reader", "TextReader"),
    "Whatsapp": ("agno.os.interfaces.whatsapp", "Whatsapp"),
    "Telegram": ("agno.os.interfaces.telegram", "Telegram"),
    "Slack": ("agno.os.interfaces.slack", "Slack"),
    "A2A": ("agno.os.interfaces.a2a", "A2A"),
    "AGUI": ("agno.os.interfaces.agui", "AGUI"),
}

INTERFACE_IMPORTS: dict[str, tuple[str, str]] = {
    "whatsapp": ("agno.os.interfaces.whatsapp", "Whatsapp"),
    "telegram": ("agno.os.interfaces.telegram", "Telegram"),
    "slack": ("agno.os.interfaces.slack", "Slack"),
    "a2a": ("agno.os.interfaces.a2a", "A2A"),
    "ag_ui": ("agno.os.interfaces.agui", "AGUI"),
}

INTERFACE_PRESET_ORDER = ("whatsapp", "telegram", "slack", "a2a", "ag_ui")

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


def resolve_local_skill_path(raw_path: str) -> str:
    cleaned = raw_path.strip()
    if not cleaned:
        return ""

    path = Path(cleaned).expanduser()
    if path.is_absolute():
        return str(path)

    return str((PROJECT_ROOT / path).resolve())


def load_local_skill_summaries(skills_node: GraphNode | None) -> list[tuple[str, str]]:
    if skills_node is None:
        return []

    extras = skills_node.data.extras or {}
    resolved_path = resolve_local_skill_path(str(extras.get("skillsPath") or ""))
    if not resolved_path:
        return []

    try:
        from agno.skills import LocalSkills

        loaded_skills = LocalSkills(path=resolved_path, validate=False).load()
    except Exception:
        return []

    summaries: list[tuple[str, str]] = []
    for skill in loaded_skills:
        skill_name = str(getattr(skill, "name", "") or "").strip()
        if not skill_name:
            continue
        description = str(getattr(skill, "description", "") or "").strip()
        summaries.append((skill_name, description))
    return summaries


def get_node_provider_config(node: GraphNode) -> dict[str, object]:
    extras = node.data.extras or {}
    provider_config = extras.get("providerConfig") or {}
    if isinstance(provider_config, dict):
        return provider_config
    return {}


def get_node_provider_id(node: GraphNode) -> str:
    provider_config = get_node_provider_config(node)
    explicit_provider = str(node.data.provider or "").strip()
    profile_provider = str(provider_config.get("provider_profile") or "").strip()
    normalized_explicit_provider = normalize_provider_id(explicit_provider)
    normalized_profile_provider = normalize_provider_id(profile_provider)

    if normalized_profile_provider:
        explicit_definition = get_provider_definition(normalized_explicit_provider)
        profile_definition = get_provider_definition(normalized_profile_provider)
        if explicit_definition is None and profile_definition is not None:
            return normalized_profile_provider
        if normalized_explicit_provider == "openai" and normalized_profile_provider != "openai":
            return normalized_profile_provider

    provider_value = explicit_provider or profile_provider
    if not str(provider_value).strip() and node.type in {
        NodeType.AGENT,
        NodeType.TEAM,
        NodeType.LEARNING_MACHINE,
        NodeType.MEMORY_MANAGER,
        NodeType.SESSION_SUMMARY_MANAGER,
        NodeType.COMPRESSION_MANAGER,
    }:
        return "openai"
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
        if node.type not in {
            NodeType.AGENT,
            NodeType.TEAM,
            NodeType.LEARNING_MACHINE,
            NodeType.MEMORY_MANAGER,
            NodeType.SESSION_SUMMARY_MANAGER,
            NodeType.COMPRESSION_MANAGER,
        }:
            continue

        if node.type in {NodeType.LEARNING_MACHINE, NodeType.MEMORY_MANAGER, NodeType.SESSION_SUMMARY_MANAGER, NodeType.COMPRESSION_MANAGER}:
            extras = node.data.extras or {}
            if node.type == NodeType.LEARNING_MACHINE:
                if not bool(extras.get("useLearningModel")):
                    continue
            elif not bool(extras.get("useManagerModel")):
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


def collect_raw_expression_imports(ordered_nodes: list[GraphNode]) -> list[str]:
    matched_imports: set[tuple[str, str]] = set()

    for node in ordered_nodes:
        raw_values: list[str] = []

        extras = node.data.extras or {}
        if node.type == NodeType.AGENT:
            agent_config = extras.get("agentConfig") or {}
            if isinstance(agent_config, dict):
                raw_values.extend(value for value in agent_config.values() if isinstance(value, str))
        elif node.type == NodeType.TEAM:
            team_config = extras.get("teamConfig") or {}
            if isinstance(team_config, dict):
                raw_values.extend(value for value in team_config.values() if isinstance(value, str))
        elif node.type == NodeType.DATABASE:
            raw_values.append(str(extras.get("dbExpression") or ""))
        elif node.type == NodeType.VECTOR_DB:
            raw_values.append(str(extras.get("vectorExpression") or ""))
        elif node.type == NodeType.KNOWLEDGE:
            raw_values.append(str(extras.get("knowledgeExpression") or ""))
            raw_values.append(str(extras.get("contentsDbExpression") or ""))
        elif node.type == NodeType.SKILLS:
            raw_values.append(str(extras.get("skillsExpression") or "Skills(loaders=[LocalSkills(path='.', validate=True)])"))
        elif node.type == NodeType.LEARNING_MACHINE:
            raw_values.append(str(extras.get("learningMachineExpression") or "LearningMachine()"))
        elif node.type in {NodeType.MEMORY_MANAGER, NodeType.SESSION_SUMMARY_MANAGER, NodeType.COMPRESSION_MANAGER}:
            raw_values.append(str(extras.get("managerExpression") or ""))
        elif node.type == NodeType.INTERFACE:
            raw_values.append(str(extras.get("interfaceExpression") or ""))

        for raw_value in raw_values:
            if not raw_value.strip():
                continue

            for symbol, import_ref in RAW_EXPRESSION_IMPORTS.items():
                if re.search(rf"\b{re.escape(symbol)}\b", raw_value):
                    matched_imports.add(import_ref)

    return [f"from {module} import {class_name}" for module, class_name in sorted(matched_imports)]


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


def _extract_named_string_arg(expression: str, arg_name: str) -> str:
    pattern = re.compile(rf"{re.escape(arg_name)}\s*=\s*(['\"])(.*?)\1")
    match = pattern.search(str(expression or ""))
    return str(match.group(2) or "").strip() if match else ""


def infer_sqltools_config_from_graph(graph: CanvasGraph | None) -> dict[str, Any]:
    default_config = {"db_url": "sqlite:///tmp/agno.db"}
    if graph is None:
        return default_config

    database_nodes = [node for node in graph.nodes if node.type == NodeType.DATABASE]
    if not database_nodes:
        return default_config

    extras = database_nodes[0].data.extras or {}
    preset = str(extras.get("dbPreset") or "").strip().lower()
    if preset == "sqlite-db":
        directory = str(extras.get("dbDirectory") or "tmp").strip().strip("/") or "tmp"
        db_name = str(extras.get("dbName") or "agno").strip() or "agno"
        return {"db_url": f"sqlite:///{directory}/{db_name}.db"}

    expression = str(extras.get("dbExpression") or "").strip()
    if expression:
        db_url = _extract_named_string_arg(expression, "db_url")
        if db_url:
            return {"db_url": db_url}

        db_file = _extract_named_string_arg(expression, "db_file")
        if db_file:
            return {"db_url": f"sqlite:///{db_file}"}

    return default_config


def _sqlite_path_from_db_url(db_url: object) -> str:
    raw = str(db_url or "").strip()
    if not raw.startswith("sqlite:///"):
        return ""
    return raw[len("sqlite:///") :].strip()


def render_tool_node(node: GraphNode, var_name: str, *, graph: CanvasGraph | None = None) -> tuple[list[str], list[tuple[str, str]], bool]:
    extras = node.data.extras or {}
    tool_mode = extras.get("toolMode", "builtin")

    if tool_mode == "builtin":
        class_name = extras.get("builtinClassName", "WebSearchTools")
        import_path = extras.get("builtinImportPath", "agno.tools.websearch")
        config_raw = extras.get("builtinConfig") or ""
        parsed_config: dict[str, Any] = {}
        if isinstance(config_raw, str) and config_raw.strip():
            parsed = parse_json_if_needed(config_raw)
            if isinstance(parsed, dict):
                parsed_config = dict(parsed)

        if str(class_name or "") == "SQLTools":
            has_sql_connection = any(
                key in parsed_config and parsed_config.get(key) not in (None, "")
                for key in ("db_url", "db_engine", "host")
            )
            if not has_sql_connection:
                inferred_config = infer_sqltools_config_from_graph(graph)
                parsed_config = {**inferred_config, **parsed_config}

            sqlite_file_path = _sqlite_path_from_db_url(parsed_config.get("db_url"))
            if sqlite_file_path:
                path_var = sanitize_identifier(f"{var_name}_sqlite_path")
                dir_var = sanitize_identifier(f"{var_name}_sqlite_dir")
                return (
                    [
                        f"{path_var} = Path({python_literal(sqlite_file_path)})",
                        f"{dir_var} = {path_var}.parent",
                        f"if str({dir_var}) not in ('', '.'):",
                        f"    {dir_var}.mkdir(parents=True, exist_ok=True)",
                        f"{var_name} = {class_name}(db_url='sqlite:///' + str({path_var}.resolve()))",
                        "",
                    ],
                    [(import_path, class_name)],
                    False,
                )

        kwargs = ", ".join(f"{key}={python_literal(value)}" for key, value in parsed_config.items()) if parsed_config else ""
        expression = f"{class_name}({kwargs})" if kwargs else f"{class_name}()"
        return [f"{var_name} = {expression}", ""], [(import_path, class_name)], False

    function_name = sanitize_identifier(str(extras.get("functionName") or node.data.name or var_name))
    function_code = normalize_function_tool_code(function_name, str(extras.get("functionCode") or ""))
    extracted_name = extract_function_name(function_code, function_name)
    lines = [function_code.rstrip(), f"{var_name} = {extracted_name}", ""]
    return lines, [], True


def render_resource_node(
    node: GraphNode,
    var_name: str,
    graph: CanvasGraph,
    symbol_map: dict[str, str],
    provider_class_refs: dict[str, str] | None = None,
) -> list[str]:
    extras = node.data.extras or {}
    provider_class_refs = provider_class_refs or {}

    if node.type == NodeType.DATABASE:
        expression = str(extras.get("dbExpression") or "SqliteDb(db_file='tmp/agno.db')")
        return [f"{var_name} = {expression}", ""]

    if node.type == NodeType.VECTOR_DB:
        expression = str(extras.get("vectorExpression") or "PgVector(table_name='documents', db_url='postgresql+psycopg://ai:ai@localhost:5532/ai')")
        return [f"{var_name} = {expression}", ""]

    if node.type == NodeType.SKILLS:
        legacy_expression = str(extras.get("skillsExpression") or "").strip()
        has_structured_skills_config = extras.get("skillsPath") is not None or extras.get("skillsValidate") is not None
        if legacy_expression and not has_structured_skills_config:
            return [f"{var_name} = {legacy_expression}", ""]

        resolved_path = resolve_local_skill_path(str(extras.get("skillsPath") or ""))
        validate = bool(extras.get("skillsValidate", True))
        if validate and resolved_path:
            try:
                from agno.skills.validator import validate_skill_directory

                if validate_skill_directory(Path(resolved_path)):
                    validate = False
            except Exception:
                pass
        expression = (
            "Skills(loaders=["
            f"LocalSkills(path={python_literal(resolved_path)}, validate={validate})"
            "])"
        )
        return [f"{var_name} = {expression}", ""]

    if node.type == NodeType.KNOWLEDGE:
        incoming_nodes = [graph_node for graph_node in graph.nodes if graph_node.id in incoming_ids(graph, node.id)]
        incoming_vector_symbol = next(
            (symbol_map[source.id] for source in incoming_nodes if source.type == NodeType.VECTOR_DB and source.id in symbol_map),
            None,
        )
        incoming_db_symbol = next(
            (symbol_map[source.id] for source in incoming_nodes if source.type == NodeType.DATABASE and source.id in symbol_map),
            None,
        )
        legacy_expression = str(extras.get("knowledgeExpression") or "").strip()
        has_structured_knowledge_config = any(
            key in extras
            for key in (
                "knowledgeMaxResults",
                "knowledgeIsolateVectorSearch",
                "knowledgeReader",
                "ingestAttachedFiles",
                "ingestInputText",
                "staticText",
                "staticUrls",
            )
        )

        if not incoming_vector_symbol and legacy_expression and not has_structured_knowledge_config:
            return [f"{var_name} = {legacy_expression}", ""]

        include_contents_db = bool(extras.get("includeContentsDb"))
        knowledge_args: list[str] = []
        if node.data.name:
            knowledge_args.append(f"name={python_literal(node.data.name)}")
        if node.data.description:
            knowledge_args.append(f"description={python_literal(node.data.description)}")

        vector_expr = incoming_vector_symbol or "PgVector(table_name='documents', db_url='postgresql+psycopg://ai:ai@localhost:5532/ai')"
        knowledge_args.append(f"vector_db={vector_expr}")

        if include_contents_db:
            contents_expr = incoming_db_symbol or str(extras.get("contentsDbExpression") or "").strip()
            if contents_expr:
                knowledge_args.append(f"contents_db={contents_expr}")

        max_results = extras.get("knowledgeMaxResults")
        if max_results not in (None, ""):
            try:
                knowledge_args.append(f"max_results={max(1, int(max_results))}")
            except (TypeError, ValueError):
                pass

        if bool(extras.get("knowledgeIsolateVectorSearch")):
            knowledge_args.append("isolate_vector_search=True")

        expression = f"Knowledge({', '.join(knowledge_args)})"

        return [f"{var_name} = {expression}", ""]

    if node.type == NodeType.LEARNING_MACHINE:
        incoming_nodes = [graph_node for graph_node in graph.nodes if graph_node.id in incoming_ids(graph, node.id)]
        incoming_db_symbol = next(
            (symbol_map[source.id] for source in incoming_nodes if source.type == NodeType.DATABASE and source.id in symbol_map),
            None,
        )
        incoming_knowledge_symbol = next(
            (symbol_map[source.id] for source in incoming_nodes if source.type == NodeType.KNOWLEDGE and source.id in symbol_map),
            None,
        )
        args: list[str] = []
        env_setup_lines: list[str] = []
        if bool(extras.get("useLearningModel")):
            provider_class_ref = provider_class_refs.get(get_node_provider_id(node))
            model_expr, _, _ = render_provider_model_expression(
                provider_id=get_node_provider_id(node),
                model_name=node.data.model or "gpt-4.1-mini",
                temperature=node.data.temperature,
                provider_config=get_node_provider_config(node),
                class_ref=provider_class_ref,
            )
            env_setup_lines = build_provider_env_setup(node)
            args.append(f"model={model_expr}")
        if incoming_db_symbol:
            args.append(f"db={incoming_db_symbol}")
        if incoming_knowledge_symbol:
            args.append(f"knowledge={incoming_knowledge_symbol}")
        namespace = str(extras.get("learningNamespace") or "").strip()
        if namespace:
            args.append(f"namespace={python_literal(namespace)}")
        if bool(extras.get("learningUserProfile")):
            args.append("user_profile=True")
        if bool(extras.get("learningUserMemory")):
            args.append("user_memory=True")
        if bool(extras.get("learningSessionContext")):
            args.append("session_context=True")
        if bool(extras.get("learningEntityMemory")):
            args.append("entity_memory=True")
        if bool(extras.get("learningLearnedKnowledge")):
            args.append("learned_knowledge=True")
        if bool(extras.get("learningDecisionLog")):
            args.append("decision_log=True")
        if bool(extras.get("learningDebugMode")):
            args.append("debug_mode=True")
        expression = f"LearningMachine({', '.join(args)})" if args else "LearningMachine()"
        return [*env_setup_lines, f"{var_name} = {expression}", ""]

    if node.type == NodeType.MEMORY_MANAGER:
        incoming_nodes = [graph_node for graph_node in graph.nodes if graph_node.id in incoming_ids(graph, node.id)]
        incoming_db_symbol = next(
            (symbol_map[source.id] for source in incoming_nodes if source.type == NodeType.DATABASE and source.id in symbol_map),
            None,
        )
        args: list[str] = []
        if bool(extras.get("useManagerModel")):
            provider_class_ref = provider_class_refs.get(get_node_provider_id(node))
            model_expr, _, _ = render_provider_model_expression(
                provider_id=get_node_provider_id(node),
                model_name=node.data.model or "gpt-4.1-mini",
                temperature=node.data.temperature,
                provider_config=get_node_provider_config(node),
                class_ref=provider_class_ref,
            )
            args.append(f"model={model_expr}")
        if incoming_db_symbol:
            args.append(f"db={incoming_db_symbol}")
        system_message = str(extras.get("systemMessage") or "").strip()
        memory_capture_instructions = str(extras.get("memoryCaptureInstructions") or "").strip()
        additional_instructions = str(extras.get("additionalInstructions") or "").strip()
        debug_mode = bool(extras.get("debugMode"))
        if system_message:
            args.append(f"system_message={python_literal(system_message)}")
        if memory_capture_instructions:
            args.append(f"memory_capture_instructions={python_literal(memory_capture_instructions)}")
        if additional_instructions:
            args.append(f"additional_instructions={python_literal(additional_instructions)}")
        if debug_mode:
            args.append("debug_mode=True")
        expression = f"MemoryManager({', '.join(args)})" if args else "MemoryManager()"
        return [f"{var_name} = {expression}", ""]

    if node.type == NodeType.SESSION_SUMMARY_MANAGER:
        args: list[str] = []
        if bool(extras.get("useManagerModel")):
            provider_class_ref = provider_class_refs.get(get_node_provider_id(node))
            model_expr, _, _ = render_provider_model_expression(
                provider_id=get_node_provider_id(node),
                model_name=node.data.model or "gpt-4.1-mini",
                temperature=node.data.temperature,
                provider_config=get_node_provider_config(node),
                class_ref=provider_class_ref,
            )
            args.append(f"model={model_expr}")
        summary_request_message = str(extras.get("summaryRequestMessage") or "").strip()
        session_summary_prompt = str(extras.get("sessionSummaryPrompt") or "").strip()
        if summary_request_message:
            args.append(f"summary_request_message={python_literal(summary_request_message)}")
        if session_summary_prompt:
            args.append(f"session_summary_prompt={python_literal(session_summary_prompt)}")
        expression = f"SessionSummaryManager({', '.join(args)})" if args else "SessionSummaryManager()"
        return [f"{var_name} = {expression}", ""]

    if node.type == NodeType.COMPRESSION_MANAGER:
        args: list[str] = []
        if bool(extras.get("useManagerModel")):
            provider_class_ref = provider_class_refs.get(get_node_provider_id(node))
            model_expr, _, _ = render_provider_model_expression(
                provider_id=get_node_provider_id(node),
                model_name=node.data.model or "gpt-4.1-mini",
                temperature=node.data.temperature,
                provider_config=get_node_provider_config(node),
                class_ref=provider_class_ref,
            )
            args.append(f"model={model_expr}")
        if extras.get("compressToolResults") is False:
            args.append("compress_tool_results=False")
        compress_tool_results_limit = extras.get("compressToolResultsLimit")
        compress_token_limit = extras.get("compressTokenLimit")
        compress_tool_call_instructions = str(extras.get("compressToolCallInstructions") or "").strip()
        if compress_tool_results_limit not in (None, ""):
            args.append(f"compress_tool_results_limit={int(compress_tool_results_limit)}")
        if compress_token_limit not in (None, ""):
            args.append(f"compress_token_limit={int(compress_token_limit)}")
        if compress_tool_call_instructions:
            args.append(f"compress_tool_call_instructions={python_literal(compress_tool_call_instructions)}")
        expression = f"CompressionManager({', '.join(args)})" if args else "CompressionManager()"
        return [f"{var_name} = {expression}", ""]

    return []


def normalize_interface_preset(raw_value: object) -> str:
    preset = str(raw_value or "").strip().lower()
    if preset in {*INTERFACE_IMPORTS.keys(), "all"}:
        return preset
    return ""


def resolve_interface_env_name(extras: dict[str, object] | None, key: str, default: str) -> str:
    safe_extras = extras or {}
    value = str(safe_extras.get(key) or "").strip()
    return value or default


def build_interface_expression_from_preset(
    preset: str,
    source_symbol: str,
    source_type: NodeType,
    extras: dict[str, object] | None = None,
) -> str | None:
    target_is_team = source_type == NodeType.TEAM
    singular_target_kwarg = "team" if target_is_team else "agent"
    list_target_kwarg = "teams" if target_is_team else "agents"
    whatsapp_phone_number_env = resolve_interface_env_name(extras, "whatsappPhoneNumberIdEnv", "WHATSAPP_PHONE_NUMBER_ID")
    whatsapp_access_token_env = resolve_interface_env_name(extras, "whatsappAccessTokenEnv", "WHATSAPP_ACCESS_TOKEN")
    whatsapp_verify_token_env = resolve_interface_env_name(extras, "whatsappVerifyTokenEnv", "WHATSAPP_VERIFY_TOKEN")
    telegram_token_env = resolve_interface_env_name(extras, "telegramTokenEnv", "TELEGRAM_BOT_TOKEN")
    slack_token_env = resolve_interface_env_name(extras, "slackTokenEnv", "SLACK_BOT_TOKEN")
    slack_signing_secret_env = resolve_interface_env_name(extras, "slackSigningSecretEnv", "SLACK_SIGNING_SECRET")

    if preset == "whatsapp":
        return (
            f"Whatsapp({singular_target_kwarg}={source_symbol}, "
            f"phone_number_id=os.getenv({python_literal(whatsapp_phone_number_env)}), "
            f"access_token=os.getenv({python_literal(whatsapp_access_token_env)}), "
            f"verify_token=os.getenv({python_literal(whatsapp_verify_token_env)}))"
        )

    if preset == "telegram":
        return (
            f"Telegram({singular_target_kwarg}={source_symbol}, "
            f"token=os.getenv({python_literal(telegram_token_env)}))"
        )

    if preset == "slack":
        return (
            f"Slack({singular_target_kwarg}={source_symbol}, "
            f"token=os.getenv({python_literal(slack_token_env)}), "
            f"signing_secret=os.getenv({python_literal(slack_signing_secret_env)}))"
        )

    if preset == "a2a":
        return f"A2A({list_target_kwarg}=[{source_symbol}])"

    if preset == "ag_ui":
        return f"AGUI({singular_target_kwarg}={source_symbol})"

    return None


def render_interface_node(
    node: GraphNode,
    var_name: str,
    graph: CanvasGraph,
    node_map: dict[str, GraphNode],
    symbol_map: dict[str, str],
) -> tuple[list[str], set[tuple[str, str]], list[str]]:
    extras = node.data.extras or {}
    warnings: list[str] = []
    import_refs: set[tuple[str, str]] = set()

    incoming_source_ids = [
        source_id
        for source_id in incoming_ids(graph, node.id)
        if source_id in symbol_map
        and node_map.get(source_id)
        and node_map[source_id].type in {NodeType.AGENT, NodeType.TEAM}
    ]

    raw_expression = str(extras.get("interfaceExpression") or "").strip()
    preset = normalize_interface_preset(extras.get("interfacePreset"))

    if not incoming_source_ids:
        warnings.append(f"Interface '{node.data.name}' has no connected Agent or Team.")
        if raw_expression:
            return [f"{var_name} = {raw_expression}", ""], import_refs, warnings
        return [], import_refs, warnings

    if len(incoming_source_ids) > 1:
        warnings.append(
            f"Interface '{node.data.name}' has multiple connected executors; using the first supported connection."
        )

    source_node = node_map[incoming_source_ids[0]]
    source_symbol = symbol_map[incoming_source_ids[0]]
    source_type = source_node.type
    resolved_target_type = "team" if source_type == NodeType.TEAM else "agent"

    configured_target = str(extras.get("interfaceTargetType") or "").strip().lower()
    if configured_target in {"agent", "team"} and configured_target != resolved_target_type:
        warnings.append(
            f"Interface '{node.data.name}' target type is '{configured_target}', but connected node is '{resolved_target_type}'. Using '{resolved_target_type}'."
        )

    expression: str | None = None
    if preset == "all":
        expressions: list[str] = []
        for interface_preset in INTERFACE_PRESET_ORDER:
            interface_expression = build_interface_expression_from_preset(
                interface_preset,
                source_symbol,
                source_type,
                extras,
            )
            if interface_expression:
                expressions.append(interface_expression)
                import_refs.add(INTERFACE_IMPORTS[interface_preset])
        if expressions:
            expression = f"[{', '.join(expressions)}]"
    elif preset in INTERFACE_IMPORTS:
        expression = build_interface_expression_from_preset(preset, source_symbol, source_type, extras)
        import_refs.add(INTERFACE_IMPORTS[preset])

    if not expression and raw_expression:
        expression = raw_expression.replace("<agent>", source_symbol).replace("<team>", source_symbol)

    if not expression:
        warnings.append(f"Interface '{node.data.name}' does not have a valid preset or expression.")
        return [], import_refs, warnings

    return [f"{var_name} = {expression}", ""], import_refs, warnings


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


def build_skills_usage_guidance(skills_node: GraphNode | None = None) -> str:
    skill_summaries = load_local_skill_summaries(skills_node)
    lines = [
        "Connected skills are available to this agent.",
        "When a request matches one of those skills, do not rely on memory alone.",
    ]

    if skill_summaries:
        lines.append("Available connected skills:")
        for skill_name, description in skill_summaries:
            summary = f"- `{skill_name}`"
            if description:
                summary += f": {description}"
            lines.append(summary)
        if len(skill_summaries) == 1:
            lines.append(
                f"Load that skill first with `get_skill_instructions({python_literal(skill_summaries[0][0])})` before answering."
            )
        else:
            skill_names = ", ".join(f"`{skill_name}`" for skill_name, _ in skill_summaries)
            lines.append(
                f"Pick the most relevant skill from {skill_names} and call `get_skill_instructions(skill_name)` before answering."
            )
    else:
        lines.append("First call `get_skill_instructions(skill_name)` for the relevant connected skill before answering.")

    lines.extend(
        [
            "After loading a skill, follow its workflow and constraints instead of paraphrasing from memory.",
            "Use `get_skill_reference` only when you need supporting documentation from that skill.",
            "Use `get_skill_script` only when the skill exposes scripts and you need to inspect or execute one.",
            "If a skill depends on tools, binaries, or local services that are not available in this flow, state that clearly instead of pretending the skill ran.",
        ]
    )
    return "\n".join(lines)


def merge_instruction_blocks(*blocks: str | None) -> str:
    return "\n\n".join(block.strip() for block in blocks if block and block.strip())


def build_agent_kwargs(
    node: GraphNode,
    tool_symbols: list[str],
    provider_class_ref: str | None = None,
    excluded_fields: set[str] | None = None,
    extra_instruction_blocks: list[str] | None = None,
) -> tuple[str, list[str]]:
    extras = node.data.extras or {}
    agent_config = extras.get("agentConfig") or {}
    if not isinstance(agent_config, dict):
        agent_config = {}
    excluded_fields = excluded_fields or set()
    extra_instruction_blocks = extra_instruction_blocks or []

    base_instructions = node.data.instructions or "Assist the user clearly and accurately."
    instructions = merge_instruction_blocks(base_instructions, build_runtime_input_guidance(), *extra_instruction_blocks)

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

    for original_key, value in agent_config.items():
        key = AGENT_FIELD_ALIASES.get(original_key, original_key)

        if key in {"name", "model", "instructions", "description"}:
            continue
        if key in excluded_fields:
            continue
        if value in (None, "", [], {}):
            continue
        if SUPPORTED_AGENT_KWARGS and key not in SUPPORTED_AGENT_KWARGS:
            model_warnings.append(
                f"Agent field '{original_key}' is not supported by the installed Agno version and was ignored."
            )
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


def parse_csv_list(raw_value: object) -> list[str]:
    if not isinstance(raw_value, str):
        return []
    return [item.strip() for item in raw_value.split(",") if item.strip()]


def build_knowledge_reader_expression(extras: dict[str, object] | None) -> str | None:
    safe_extras = extras or {}
    reader_key = str(safe_extras.get("knowledgeReader") or "auto").strip().lower()
    if not reader_key or reader_key == "auto":
        return None

    if reader_key == "pdf":
        args = [f"split_on_pages={bool(safe_extras.get('knowledgeSplitOnPages', True))}"]
        password = str(safe_extras.get("knowledgePassword") or "").strip()
        if password:
            args.append(f"password={python_literal(password)}")
        return f"PDFReader({', '.join(args)})"

    if reader_key == "csv":
        return "CSVReader()"

    if reader_key == "field_labeled_csv":
        args: list[str] = []
        chunk_title = str(safe_extras.get("knowledgeCsvChunkTitle") or "").strip()
        field_names = parse_csv_list(safe_extras.get("knowledgeCsvFieldNames"))
        if chunk_title:
            args.append(f"chunk_title={python_literal(chunk_title)}")
        if field_names:
            args.append(f"field_names={python_literal(field_names)}")
        if safe_extras.get("knowledgeCsvFormatHeaders") is False:
            args.append("format_headers=False")
        if safe_extras.get("knowledgeCsvSkipEmptyFields") is False:
            args.append("skip_empty_fields=False")
        return f"FieldLabeledCSVReader({', '.join(args)})" if args else "FieldLabeledCSVReader()"

    if reader_key == "excel":
        sheets = parse_csv_list(safe_extras.get("knowledgeExcelSheets"))
        if sheets:
            normalized_sheets: list[object] = []
            for sheet in sheets:
                if sheet.isdigit():
                    normalized_sheets.append(int(sheet))
                else:
                    normalized_sheets.append(sheet)
            return f"ExcelReader(sheets={python_literal(normalized_sheets)})"
        return "ExcelReader()"

    if reader_key == "docx":
        return "DocxReader()"
    if reader_key == "pptx":
        return "PPTXReader()"
    if reader_key == "json":
        return "JSONReader()"
    if reader_key == "markdown":
        return "MarkdownReader()"
    if reader_key == "text":
        return "TextReader()"

    return None


def build_team_kwargs(
    node: GraphNode,
    member_symbols: list[str],
    tool_symbols: list[str],
    provider_class_ref: str | None = None,
    excluded_fields: set[str] | None = None,
) -> tuple[str, list[str]]:
    extras = node.data.extras or {}
    team_config = extras.get("teamConfig") or {}
    if not isinstance(team_config, dict):
        team_config = {}
    excluded_fields = excluded_fields or set()

    base_instructions = node.data.instructions or "Coordinate the team execution."
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
        ("members", f"[{', '.join(member_symbols)}]"),
        ("name", python_literal(node.data.name)),
        ("model", model_expr),
        ("instructions", python_literal(instructions)),
    ]

    if tool_symbols:
        ordered_pairs.append(("tools", f"[{', '.join(tool_symbols)}]"))

    if node.data.description:
        ordered_pairs.append(("description", python_literal(node.data.description)))

    for original_key, value in team_config.items():
        key = TEAM_FIELD_ALIASES.get(original_key, original_key)

        if key in {"members", "name", "model", "instructions", "description", "tools"}:
            continue
        if key in excluded_fields:
            continue
        if value in (None, "", [], {}):
            continue
        if SUPPORTED_TEAM_KWARGS and key not in SUPPORTED_TEAM_KWARGS:
            model_warnings.append(
                f"Team field '{original_key}' is not supported by the installed Agno version and was ignored."
            )
            continue
        if key in RAW_TEAM_FIELDS:
            ordered_pairs.append((key, str(value)))
            continue
        if key in JSON_TEAM_FIELDS and isinstance(value, str):
            parsed = parse_json_if_needed(value)
            ordered_pairs.append((key, python_literal(parsed)))
            continue
        ordered_pairs.append((key, python_literal(value)))

    return "\n".join(f"    {key}={value}," for key, value in ordered_pairs), model_warnings


def build_workflow_kwargs(
    node: GraphNode,
    step_symbols: list[str],
    excluded_fields: set[str] | None = None,
) -> tuple[str, list[str]]:
    extras = node.data.extras or {}
    workflow_config = extras.get("workflowConfig") or {}
    if not isinstance(workflow_config, dict):
        workflow_config = {}
    excluded_fields = excluded_fields or set()

    warnings: list[str] = []
    ordered_pairs: list[tuple[str, str]] = [
        ("name", python_literal(node.data.name)),
        ("steps", f"[{', '.join(step_symbols)}]"),
    ]

    if node.data.description:
        ordered_pairs.append(("description", python_literal(node.data.description)))

    for original_key, value in workflow_config.items():
        key = original_key
        if key in {"name", "description", "steps"}:
            continue
        if key in excluded_fields:
            continue
        if value in (None, "", [], {}):
            continue
        if SUPPORTED_WORKFLOW_KWARGS and key not in SUPPORTED_WORKFLOW_KWARGS:
            warnings.append(
                f"Workflow field '{original_key}' is not supported by the installed Agno version and was ignored."
            )
            continue
        if key in JSON_WORKFLOW_FIELDS and isinstance(value, str):
            parsed = parse_json_if_needed(value)
            ordered_pairs.append((key, python_literal(parsed)))
            continue
        ordered_pairs.append((key, python_literal(value)))

    return "\n".join(f"    {key}={value}," for key, value in ordered_pairs), warnings


def build_workflow_step_kwargs(
    node: GraphNode,
    *,
    agent_symbol: str | None = None,
    team_symbol: str | None = None,
    executor_symbol: str | None = None,
    executor_label: str | None = None,
    additional_executor_labels: list[str] | None = None,
) -> tuple[str, list[str]]:
    extras = node.data.extras or {}
    warnings: list[str] = []
    ordered_pairs: list[tuple[str, str]] = [
        ("name", python_literal(node.data.name)),
    ]
    additional_executor_labels = additional_executor_labels or []

    connected_executor_count = sum(1 for value in (agent_symbol, team_symbol, executor_symbol) if value)
    if connected_executor_count > 1:
        current_label = executor_label or ("Agent" if agent_symbol else "Team" if team_symbol else "Tool")
        conflicting = ", ".join([current_label, *additional_executor_labels])
        warnings.append(
            f"Workflow step '{node.data.name}' has multiple connected executors ({conflicting}); using the first supported connection."
        )

    if agent_symbol:
        ordered_pairs.append(("agent", agent_symbol))
    elif team_symbol:
        ordered_pairs.append(("team", team_symbol))
    elif executor_symbol:
        ordered_pairs.append(("executor", executor_symbol))
    else:
        warnings.append(f"Workflow step '{node.data.name}' has no connected Agent, Team, or supported Tool executor.")

    if node.data.description:
        ordered_pairs.append(("description", python_literal(node.data.description)))

    step_fields: list[tuple[str, object]] = [
        ("max_retries", extras.get("maxRetries")),
        ("skip_on_failure", extras.get("skipOnFailure")),
        ("strict_input_validation", extras.get("strictInputValidation")),
        ("requires_confirmation", extras.get("requiresConfirmation")),
        ("confirmation_message", extras.get("confirmationMessage")),
        ("on_reject", extras.get("onReject")),
        ("requires_user_input", extras.get("requiresUserInput")),
        ("user_input_message", extras.get("userInputMessage")),
        ("on_error", extras.get("onError")),
    ]

    for key, value in step_fields:
        if value in (None, "", [], {}):
            continue
        if SUPPORTED_STEP_KWARGS and key not in SUPPORTED_STEP_KWARGS:
            warnings.append(
                f"Workflow step field '{key}' is not supported by the installed Agno version and was ignored."
            )
            continue
        ordered_pairs.append((key, python_literal(value)))

    user_input_schema_raw = extras.get("userInputSchema")
    if user_input_schema_raw not in (None, "", [], {}):
        if SUPPORTED_STEP_KWARGS and "user_input_schema" not in SUPPORTED_STEP_KWARGS:
            warnings.append(
                "Workflow step field 'user_input_schema' is not supported by the installed Agno version and was ignored."
            )
        else:
            parsed_user_input_schema = user_input_schema_raw
            if isinstance(user_input_schema_raw, str):
                parsed_user_input_schema = parse_json_if_needed(user_input_schema_raw)
            if isinstance(parsed_user_input_schema, (list, dict)):
                ordered_pairs.append(("user_input_schema", python_literal(parsed_user_input_schema)))
            else:
                warnings.append(
                    f"Workflow step '{node.data.name}' has invalid user_input_schema JSON. Expected a list or object, got {type(parsed_user_input_schema).__name__}."
                )

    return "\n".join(f"    {key}={value}," for key, value in ordered_pairs), warnings


def build_builtin_tool_workflow_executor(
    *,
    step_node: GraphNode,
    tool_node: GraphNode,
    tool_symbol: str,
    executor_var_name: str,
) -> tuple[list[str], list[str]]:
    extras = tool_node.data.extras or {}
    import_path = str(extras.get("builtinImportPath") or "").strip()
    class_name = str(extras.get("builtinClassName") or "").strip()
    config_raw = str(extras.get("builtinConfig") or "")
    selected_function_name = str(extras.get("builtinWorkflowFunction") or "").strip()
    raw_executor_args = extras.get("builtinWorkflowExecutorArgs")
    warnings: list[str] = []

    function_options, error = inspect_builtin_tool_functions(import_path, class_name, config_raw)
    if error or not function_options:
        warnings.append(
            f"Workflow step '{step_node.data.name}' could not inspect built-in Tool '{tool_node.data.name}' for executor generation: {error or 'no callable functions found'}."
        )
        return [], warnings

    selected_option = next((option for option in function_options if option.get("name") == selected_function_name), None)
    if selected_option is None:
        selected_option = function_options[0]
        if selected_function_name:
            warnings.append(
                f"Workflow step '{step_node.data.name}' requested built-in Tool function '{selected_function_name}', but it is not available on '{tool_node.data.name}'. Using '{selected_option['name']}' instead."
            )

    parsed_executor_args = parse_json_if_needed(str(raw_executor_args or ""))
    executor_args: dict[str, object] = {}
    if str(raw_executor_args or "").strip():
        if isinstance(parsed_executor_args, dict):
            executor_args = parsed_executor_args
        else:
            warnings.append(
                f"Workflow step '{step_node.data.name}' has invalid executor args JSON on built-in Tool '{tool_node.data.name}'. Ignoring those args."
            )

    parameter_specs = selected_option.get("parameters") or []
    parameter_map = {str(parameter.get("name") or ""): parameter for parameter in parameter_specs}
    unknown_arg_names = [key for key in executor_args.keys() if key not in parameter_map]
    if unknown_arg_names:
        warnings.append(
            f"Workflow step '{step_node.data.name}' provided unsupported executor args for built-in Tool '{tool_node.data.name}': {', '.join(sorted(unknown_arg_names))}."
        )

    positional_call_args: list[str] = []
    keyword_call_args: list[str] = []
    has_auto_input_binding = False
    unresolved_required_params: list[str] = []

    for parameter in parameter_specs:
        parameter_name = str(parameter.get("name") or "")
        parameter_kind = str(parameter.get("kind") or "")
        if parameter_kind in {"var_positional", "var_keyword"}:
            continue

        if parameter_name in executor_args:
            if parameter_kind == "positional_only":
                warnings.append(
                    f"Workflow step '{step_node.data.name}' cannot bind positional-only built-in Tool parameter '{parameter_name}' via JSON args on '{tool_node.data.name}'."
                )
                continue
            keyword_call_args.append(f"{parameter_name}={python_literal(executor_args[parameter_name])}")
            continue

        if not has_auto_input_binding:
            has_auto_input_binding = True
            if parameter_kind == "positional_only":
                positional_call_args.append("_agnolab_executor_input")
            else:
                keyword_call_args.append(f"{parameter_name}=_agnolab_executor_input")
            continue

        if bool(parameter.get("required")):
            unresolved_required_params.append(parameter_name)

    if unresolved_required_params:
        warnings.append(
            f"Workflow step '{step_node.data.name}' cannot fully bind built-in Tool executor '{selected_option['name']}' from '{tool_node.data.name}'. Missing required params: {', '.join(unresolved_required_params)}."
        )
        return [], warnings

    call_args = [*positional_call_args, *keyword_call_args]
    lines = [
        f"def {executor_var_name}(step_input, session_state=None, run_context=None):",
        f"    _agnolab_executor = {tool_symbol}.functions[{python_literal(selected_option['name'])}].entrypoint",
    ]
    if has_auto_input_binding:
        lines.append('    _agnolab_executor_input = step_input.get_input_as_string() or ""')
    if call_args:
        lines.append(f"    return _agnolab_executor({', '.join(call_args)})")
    else:
        lines.append("    return _agnolab_executor()")
    lines.append("")
    return lines, warnings


def render_input_payload(node: GraphNode) -> list[str]:
    extras = node.data.extras or {}
    input_source = str(extras.get("inputSource") or "manual").strip().lower()
    input_text = str(extras.get("inputText") or node.data.prompt or "")
    attached_file_name = str(extras.get("attachedFileName") or "")
    attached_file_alias = str(extras.get("attachedFileAlias") or attached_file_name or "")
    attached_file_mime_type = str(extras.get("attachedFileMimeType") or "text/plain")
    attached_file_encoding = str(extras.get("attachedFileEncoding") or "base64")
    attached_file_base64 = str(extras.get("attachedFileBase64") or "")
    attached_file_content = str(extras.get("attachedFileContent") or "")
    payload_json_raw = str(extras.get("payloadJson") or "").strip()
    hitl_auto_approve_raw = extras.get("hitlAutoApprove")
    hitl_user_input_raw = extras.get("hitlUserInputJson")

    metadata_payload = {}
    if payload_json_raw:
        parsed_metadata = parse_json_if_needed(payload_json_raw)
        if isinstance(parsed_metadata, dict):
            metadata_payload = parsed_metadata

    if "hitlAutoApprove" in extras:
        if isinstance(hitl_auto_approve_raw, bool):
            metadata_payload["hitl_auto_approve"] = hitl_auto_approve_raw
        else:
            normalized_hitl_auto_approve = str(hitl_auto_approve_raw or "").strip().lower()
            if normalized_hitl_auto_approve in {"true", "1", "yes", "on"}:
                metadata_payload["hitl_auto_approve"] = True
            elif normalized_hitl_auto_approve in {"false", "0", "no", "off"}:
                metadata_payload["hitl_auto_approve"] = False

    if "hitlUserInputJson" in extras:
        if isinstance(hitl_user_input_raw, dict):
            metadata_payload["hitl_user_input"] = hitl_user_input_raw
        else:
            hitl_user_input_text = str(hitl_user_input_raw or "").strip()
            if hitl_user_input_text:
                parsed_hitl_user_input = parse_json_if_needed(hitl_user_input_text)
                if isinstance(parsed_hitl_user_input, dict):
                    metadata_payload["hitl_user_input"] = parsed_hitl_user_input

    def normalize_bool(value, default: bool) -> bool:
        if isinstance(value, bool):
            return value
        normalized = str(value or "").strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
        return default

    if input_source == "email":
        email_protocol = str(extras.get("emailProtocol") or "imap").strip().lower()
        if email_protocol not in {"imap", "pop"}:
            email_protocol = "imap"

        email_security = str(extras.get("emailSecurity") or "ssl").strip().lower()
        if email_security not in {"ssl", "starttls", "none"}:
            email_security = "ssl"

        default_email_port = 995 if email_protocol == "pop" and email_security == "ssl" else 110 if email_protocol == "pop" else 993 if email_security == "ssl" else 143
        email_port_raw = str(extras.get("emailPort") or "").strip()
        try:
            email_port = int(email_port_raw) if email_port_raw else default_email_port
        except (TypeError, ValueError):
            email_port = default_email_port

        email_max_messages_raw = str(extras.get("emailMaxMessages") or "").strip()
        try:
            email_max_messages = max(1, int(email_max_messages_raw)) if email_max_messages_raw else 20
        except (TypeError, ValueError):
            email_max_messages = 20

        email_config = {
            "protocol": email_protocol,
            "security": email_security,
            "host": str(extras.get("emailHost") or "").strip(),
            "port": email_port,
            "mailbox": str(extras.get("emailMailbox") or "INBOX").strip() or "INBOX",
            "username": str(extras.get("emailUsername") or "").strip(),
            "password": str(extras.get("emailPassword") or ""),
            "max_messages": email_max_messages,
            "unread_only": normalize_bool(extras.get("emailUnreadOnly"), True if email_protocol == "imap" else False),
            "subject_filter": str(extras.get("emailSubjectFilter") or "").strip(),
            "from_filter": str(extras.get("emailFromFilter") or "").strip(),
            "to_filter": str(extras.get("emailToFilter") or "").strip(),
            "body_keywords": str(extras.get("emailBodyKeywords") or "").strip(),
        }

        lines = [
            "import imaplib",
            "import poplib",
            "import re",
            "import ssl",
            "from email import message_from_bytes",
            "from email.header import decode_header, make_header",
            "from email.utils import getaddresses",
            "",
            "flow_input_files = []",
            f"flow_input_metadata = {python_literal(metadata_payload)}",
            f"_agnolab_email_config = {python_literal(email_config)}",
            "",
            "def _agnolab_decode_email_header(value):",
            "    if not value:",
            "        return ''",
            "    try:",
            "        return str(make_header(decode_header(value)))",
            "    except Exception:",
            "        if isinstance(value, bytes):",
            "            return value.decode('utf-8', errors='replace')",
            "        return str(value)",
            "",
            "def _agnolab_join_email_addresses(value):",
            "    addresses = [address for _, address in getaddresses([str(value or '')]) if address]",
            "    if addresses:",
            "        return ', '.join(addresses)",
            "    return _agnolab_decode_email_header(value)",
            "",
            "def _agnolab_extract_email_text(message):",
            "    plain_parts = []",
            "    html_parts = []",
            "    parts = message.walk() if message.is_multipart() else [message]",
            "    for part in parts:",
            "        if part.is_multipart():",
            "            continue",
            "        if str(part.get_content_disposition() or '').lower() == 'attachment':",
            "            continue",
            "        content_type = str(part.get_content_type() or '').lower()",
            "        payload = part.get_payload(decode=True)",
            "        charset = part.get_content_charset() or 'utf-8'",
            "        if payload is None:",
            "            text = part.get_payload()",
            "            if isinstance(text, list):",
            "                continue",
            "            text = str(text or '')",
            "        else:",
            "            try:",
            "                text = payload.decode(charset, errors='replace')",
            "            except Exception:",
            "                text = payload.decode('utf-8', errors='replace')",
            "        if content_type == 'text/plain':",
            "            plain_parts.append(text)",
            "        elif content_type == 'text/html':",
            "            html_parts.append(text)",
            "    if plain_parts:",
            "        return '\\n\\n'.join(part.strip() for part in plain_parts if str(part).strip()).strip()",
            "    if html_parts:",
            "        html_text = '\\n\\n'.join(part.strip() for part in html_parts if str(part).strip())",
            "        html_text = re.sub(r'<[^>]+>', ' ', html_text)",
            "        return re.sub(r'\\s+', ' ', html_text).strip()",
            "    return ''",
            "",
            "def _agnolab_split_filter_values(raw_value):",
            "    return [item.strip().lower() for item in re.split(r'[\\n,]+', str(raw_value or '')) if item.strip()]",
            "",
            "def _agnolab_email_field_matches(value, raw_filter):",
            "    filter_values = _agnolab_split_filter_values(raw_filter)",
            "    if not filter_values:",
            "        return True",
            "    haystack = str(value or '').lower()",
            "    return any(filter_value in haystack for filter_value in filter_values)",
            "",
            "def _agnolab_email_keywords_match(value, raw_keywords):",
            "    keywords = _agnolab_split_filter_values(raw_keywords)",
            "    if not keywords:",
            "        return True",
            "    haystack = str(value or '').lower()",
            "    return all(keyword in haystack for keyword in keywords)",
            "",
            "def _agnolab_build_email_match(message):",
            "    subject = _agnolab_decode_email_header(message.get('Subject'))",
            "    sender = _agnolab_join_email_addresses(message.get('From'))",
            "    recipient = _agnolab_join_email_addresses(message.get('To'))",
            "    body_text = _agnolab_extract_email_text(message)",
            "    return {",
            "        'subject': subject,",
            "        'from': sender,",
            "        'to': recipient,",
            "        'date': str(message.get('Date') or '').strip(),",
            "        'message_id': str(message.get('Message-ID') or '').strip(),",
            "        'text': body_text,",
            "    }",
            "",
            "def _agnolab_email_matches_filters(match_data, config):",
            "    return (",
            "        _agnolab_email_field_matches(match_data.get('subject'), config.get('subject_filter'))",
            "        and _agnolab_email_field_matches(match_data.get('from'), config.get('from_filter'))",
            "        and _agnolab_email_field_matches(match_data.get('to'), config.get('to_filter'))",
            "        and _agnolab_email_keywords_match(match_data.get('text'), config.get('body_keywords'))",
            "    )",
            "",
            "def _agnolab_poll_imap_email(config):",
            "    client = None",
            "    try:",
            "        host = str(config.get('host') or '').strip()",
            "        port = int(config.get('port') or 0)",
            "        security = str(config.get('security') or 'ssl').strip().lower()",
            "        mailbox = str(config.get('mailbox') or 'INBOX').strip() or 'INBOX'",
            "        if security == 'ssl':",
            "            client = imaplib.IMAP4_SSL(host, port)",
            "        else:",
            "            client = imaplib.IMAP4(host, port)",
            "            if security == 'starttls':",
            "                client.starttls(ssl.create_default_context())",
            "        client.login(str(config.get('username') or ''), str(config.get('password') or ''))",
            "        client.select(mailbox)",
            "        search_criterion = 'UNSEEN' if bool(config.get('unread_only')) else 'ALL'",
            "        status, search_data = client.search(None, search_criterion)",
            "        if status != 'OK' or not search_data:",
            "            return None",
            "        message_ids = search_data[0].split()",
            "        for message_id in reversed(message_ids[-int(config.get('max_messages') or 20):]):",
            "            status, fetched_data = client.fetch(message_id, '(BODY.PEEK[])')",
            "            if status != 'OK' or not fetched_data:",
            "                continue",
            "            raw_message = b''",
            "            for item in fetched_data:",
            "                if isinstance(item, tuple) and len(item) > 1:",
            "                    raw_message = item[1]",
            "                    break",
            "            if not raw_message:",
            "                continue",
            "            match_data = _agnolab_build_email_match(message_from_bytes(raw_message))",
            "            if _agnolab_email_matches_filters(match_data, config):",
            "                match_data['protocol'] = 'imap'",
            "                match_data['mailbox'] = mailbox",
            "                return match_data",
            "        return None",
            "    finally:",
            "        if client is not None:",
            "            try:",
            "                client.close()",
            "            except Exception:",
            "                pass",
            "            try:",
            "                client.logout()",
            "            except Exception:",
            "                pass",
            "",
            "def _agnolab_poll_pop_email(config):",
            "    client = None",
            "    try:",
            "        host = str(config.get('host') or '').strip()",
            "        port = int(config.get('port') or 0)",
            "        security = str(config.get('security') or 'ssl').strip().lower()",
            "        if security == 'ssl':",
            "            client = poplib.POP3_SSL(host, port)",
            "        else:",
            "            client = poplib.POP3(host, port)",
            "            if security == 'starttls' and hasattr(client, 'stls'):",
            "                client.stls(ssl.create_default_context())",
            "        client.user(str(config.get('username') or ''))",
            "        client.pass_(str(config.get('password') or ''))",
            "        message_total = len(client.list()[1])",
            "        if message_total <= 0:",
            "            return None",
            "        max_messages = int(config.get('max_messages') or 20)",
            "        first_index = max(1, message_total - max_messages + 1)",
            "        for message_number in range(message_total, first_index - 1, -1):",
            "            _, response_lines, _ = client.retr(message_number)",
            "            raw_message = b'\\n'.join(response_lines)",
            "            match_data = _agnolab_build_email_match(message_from_bytes(raw_message))",
            "            if _agnolab_email_matches_filters(match_data, config):",
            "                match_data['protocol'] = 'pop'",
            "                match_data['mailbox'] = 'INBOX'",
            "                return match_data",
            "        return None",
            "    finally:",
            "        if client is not None:",
            "            try:",
            "                client.quit()",
            "            except Exception:",
            "                pass",
            "",
            "_agnolab_email_match = None",
            "_agnolab_email_error = ''",
            "_agnolab_email_listener_event = None",
            "if isinstance(flow_input_metadata, dict):",
            "    _agnolab_email_listener_event = flow_input_metadata.pop('_agnolab_email_listener_event', None)",
            "if isinstance(_agnolab_email_listener_event, dict):",
            "    _agnolab_email_match = {",
            "        'subject': str(_agnolab_email_listener_event.get('subject') or ''),",
            "        'from': str(_agnolab_email_listener_event.get('from') or ''),",
            "        'to': str(_agnolab_email_listener_event.get('to') or ''),",
            "        'date': str(_agnolab_email_listener_event.get('date') or ''),",
            "        'message_id': str(_agnolab_email_listener_event.get('message_id') or ''),",
            "        'protocol': str(_agnolab_email_listener_event.get('protocol') or _agnolab_email_config.get('protocol') or ''),",
            "        'mailbox': str(_agnolab_email_listener_event.get('mailbox') or _agnolab_email_config.get('mailbox') or ''),",
            "        'text': str(_agnolab_email_listener_event.get('text') or ''),",
            "        'message_key': str(_agnolab_email_listener_event.get('message_key') or ''),",
            "    }",
            "elif _agnolab_email_config.get('host') and _agnolab_email_config.get('username') and _agnolab_email_config.get('password'):",
            "    try:",
            "        if _agnolab_email_config.get('protocol') == 'pop':",
            "            _agnolab_email_match = _agnolab_poll_pop_email(_agnolab_email_config)",
            "        else:",
            "            _agnolab_email_match = _agnolab_poll_imap_email(_agnolab_email_config)",
            "    except Exception as exc:",
            "        _agnolab_email_error = str(exc)",
            "else:",
            "    _agnolab_email_error = 'Email inbox input requires host, username, and password.'",
            "if _agnolab_email_match:",
            "    flow_input_metadata.update({",
            "        'email_match_found': True,",
            "        'email_subject': _agnolab_email_match.get('subject'),",
            "        'email_from': _agnolab_email_match.get('from'),",
            "        'email_to': _agnolab_email_match.get('to'),",
            "        'email_date': _agnolab_email_match.get('date'),",
            "        'email_message_id': _agnolab_email_match.get('message_id'),",
            "        'email_message_key': _agnolab_email_match.get('message_key'),",
            "        'email_protocol': _agnolab_email_match.get('protocol'),",
            "        'email_mailbox': _agnolab_email_match.get('mailbox'),",
            "        'email': dict(_agnolab_email_match),",
            "    })",
            "else:",
            "    flow_input_metadata['email_match_found'] = False",
            "if _agnolab_email_error:",
            "    flow_input_metadata['email_error'] = _agnolab_email_error",
            f"flow_input_payload = {{'text': (_agnolab_email_match or {{}}).get('text') or {python_literal(input_text)}, 'files': flow_input_files, 'metadata': flow_input_metadata}}",
            "flow_input_file_path = None",
            "flow_input_parts = []",
            "if flow_input_payload.get('text'):",
            "    flow_input_parts.append(f\"User input:\\n{flow_input_payload['text']}\")",
            "if flow_input_metadata:",
            "    flow_input_parts.append(\"Payload metadata:\\n\" + json.dumps(flow_input_metadata, ensure_ascii=False, indent=2))",
            "flow_input = \"\\n\\n\".join(flow_input_parts) if flow_input_parts else json.dumps(flow_input_payload, ensure_ascii=False)",
        ]
        return lines

    runtime_event_metadata_key = (
        "_agnolab_webhook_event"
        if input_source == "webhook"
        else "_agnolab_form_event"
        if input_source == "form"
        else "_agnolab_whatsapp_event"
        if input_source == "whatsapp"
        else ""
    )
    lines = [
        "flow_input_files = []",
        f"flow_input_metadata = {python_literal(metadata_payload)}",
        "_agnolab_runtime_files = None",
        "_agnolab_runtime_event = None",
        "if isinstance(flow_input_metadata, dict):",
        "    _agnolab_runtime_files = flow_input_metadata.pop('_agnolab_runtime_files', None)",
    ]

    if runtime_event_metadata_key:
        lines.append(f"    _agnolab_runtime_event = flow_input_metadata.pop({python_literal(runtime_event_metadata_key)}, None)")

    lines.extend(
        [
            "",
            "def _agnolab_materialize_runtime_file(index, file_item):",
            "    if not isinstance(file_item, dict):",
            "        return None",
            "    _agnolab_raw_name = str(file_item.get('name') or f'input_{index}.bin')",
            "    _agnolab_safe_name = Path(_agnolab_raw_name).name or f'input_{index}.bin'",
            "    _agnolab_alias = str(file_item.get('alias') or _agnolab_safe_name)",
            "    _agnolab_mime_type = str(file_item.get('mime_type') or 'application/octet-stream')",
            "    _agnolab_encoding = str(file_item.get('encoding') or 'base64').strip().lower() or 'base64'",
            "    _agnolab_base64 = str(file_item.get('base64') or '')",
            "    _agnolab_content = str(file_item.get('content') or '')",
            "    _agnolab_file_path = Path(f'{index}_{_agnolab_safe_name}')",
            "    if _agnolab_base64:",
            "        _agnolab_file_path.write_bytes(base64.b64decode(_agnolab_base64))",
            "    else:",
            "        _agnolab_file_path.write_text(_agnolab_content, encoding='utf-8')",
            "    return {",
            "        'name': _agnolab_safe_name,",
            "        'alias': _agnolab_alias,",
            "        'mime_type': _agnolab_mime_type,",
            "        'encoding': _agnolab_encoding,",
            "        'path': str(_agnolab_file_path.resolve()),",
            "    }",
            "",
            "if isinstance(_agnolab_runtime_files, list):",
            "    for _agnolab_index, _agnolab_file_item in enumerate(_agnolab_runtime_files, start=1):",
            "        _agnolab_runtime_file = _agnolab_materialize_runtime_file(_agnolab_index, _agnolab_file_item)",
            "        if _agnolab_runtime_file is not None:",
            "            flow_input_files.append(_agnolab_runtime_file)",
            "",
            "_agnolab_runtime_text = ''",
            "if isinstance(_agnolab_runtime_event, dict):",
            "    _agnolab_runtime_text = str(_agnolab_runtime_event.get('text') or '')",
            "    _agnolab_runtime_metadata = _agnolab_runtime_event.get('metadata')",
            "    if isinstance(_agnolab_runtime_metadata, dict):",
            "        flow_input_metadata.update(_agnolab_runtime_metadata)",
        ]
    )

    if attached_file_name and (attached_file_base64 or attached_file_content):
        lines.extend(
            [
                f"_input_file_name = {python_literal(attached_file_name)}",
                f"_input_file_alias = {python_literal(attached_file_alias)}",
                f"_input_file_mime_type = {python_literal(attached_file_mime_type)}",
                f"_input_file_encoding = {python_literal(attached_file_encoding)}",
                f"_input_file_base64 = {python_literal(attached_file_base64)}",
                f"_input_file_content = {python_literal(attached_file_content)}",
                "_input_file_path = Path(Path(_input_file_name).name or 'input_file')",
                "if _input_file_base64:",
                "    _input_file_path.write_bytes(base64.b64decode(_input_file_base64))",
                "else:",
                "    _input_file_path.write_text(_input_file_content, encoding='utf-8')",
                "flow_input_files.append({",
                "    'name': Path(_input_file_name).name or 'input_file',",
                "    'alias': _input_file_alias,",
                "    'mime_type': _input_file_mime_type,",
                "    'encoding': _input_file_encoding,",
                "    'path': str(_input_file_path.resolve()),",
                "})",
            ]
        )

    lines.extend(
        [
            f"flow_input_payload = {{'text': _agnolab_runtime_text or {python_literal(input_text)}, 'files': flow_input_files, 'metadata': flow_input_metadata}}",
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
    output_mode = str(extras.get("outputMode") or "api").strip().lower()
    if output_mode not in {"api", "email", "chat", "spreadsheet"}:
        warnings.append(f"Output mode '{output_mode}' is not supported; falling back to API POST.")
        output_mode = "api"

    def parse_timeout(value: object, *, default: float, label: str) -> float:
        if value in (None, ""):
            return default
        try:
            timeout_value = float(value)
        except (TypeError, ValueError):
            warnings.append(f"{label} timeout is invalid; falling back to {default:g} seconds.")
            return default
        if timeout_value <= 0:
            warnings.append(f"{label} timeout must be greater than zero; falling back to {default:g} seconds.")
            return default
        return timeout_value

    def parse_object_template(raw_text: str, *, label: str) -> dict[str, object]:
        if not raw_text.strip():
            return {}
        if "$" in raw_text:
            return {}
        parsed_value = parse_json_if_needed(raw_text)
        if isinstance(parsed_value, dict):
            return {str(key): value for key, value in parsed_value.items()}
        warnings.append(f"{label} must be a JSON object; ignoring it.")
        return {}

    def parse_bool(value: object, *, default: bool) -> bool:
        if isinstance(value, bool):
            return value
        normalized = str(value or "").strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
        return default

    lines = [
        f"_agnolab_output_mode = {python_literal(output_mode)}",
        "_agnolab_delivery_timestamp = datetime.now(timezone.utc).isoformat()",
        "",
        "def _agnolab_context_value(key):",
        "    if isinstance(flow_input_metadata, dict) and key in flow_input_metadata:",
        "        return flow_input_metadata.get(key)",
        "    if key in {'flow_name', 'project_name'}:",
        f"        return {python_literal(project_name)}",
        "    if key == 'output_node':",
        f"        return {python_literal(node.data.name)}",
        "    if key == 'result_text':",
        "        return flow_result_text",
        "    if key == 'input_text':",
        "        if isinstance(flow_input_payload, dict):",
        "            return flow_input_payload.get('text')",
        "        return None",
        "    if key == 'timestamp':",
        "        return _agnolab_delivery_timestamp",
        "    return None",
        "",
        "def _agnolab_replace_context_tokens(text):",
        "    _agnolab_parts = []",
        "    _agnolab_index = 0",
        "    while _agnolab_index < len(text):",
        "        _agnolab_char = text[_agnolab_index]",
        "        if (",
        "            _agnolab_char != '$'",
        "            or _agnolab_index + 1 >= len(text)",
        "            or not (text[_agnolab_index + 1].isalpha() or text[_agnolab_index + 1] == '_')",
        "        ):",
        "            _agnolab_parts.append(_agnolab_char)",
        "            _agnolab_index += 1",
        "            continue",
        "        _agnolab_end = _agnolab_index + 2",
        "        while _agnolab_end < len(text) and (text[_agnolab_end].isalnum() or text[_agnolab_end] == '_'):",
        "            _agnolab_end += 1",
        "        _agnolab_value = _agnolab_context_value(text[_agnolab_index + 1:_agnolab_end])",
        "        _agnolab_parts.append('' if _agnolab_value is None else str(_agnolab_value))",
        "        _agnolab_index = _agnolab_end",
        "    return ''.join(_agnolab_parts)",
        "",
        "def _agnolab_resolve_template_value(value):",
        "    if isinstance(value, dict):",
        "        return {key: _agnolab_resolve_template_value(item) for key, item in value.items()}",
        "    if isinstance(value, list):",
        "        return [_agnolab_resolve_template_value(item) for item in value]",
        "    if isinstance(value, str):",
        "        if value.startswith('__agnolab_ctx__:'):",
        "            return _agnolab_context_value(value[len('__agnolab_ctx__:'):])",
        "        if value.startswith('$') and len(value) > 1 and (value[1].isalpha() or value[1] == '_') and all(char.isalnum() or char == '_' for char in value[2:]):",
        "            return _agnolab_context_value(value[1:])",
        "        return _agnolab_replace_context_tokens(value)",
        "    return value",
        "",
        "def _agnolab_prepare_json_template(raw_text):",
        "    _agnolab_parts = []",
        "    _agnolab_index = 0",
        "    _agnolab_in_string = False",
        "    _agnolab_escape = False",
        "    while _agnolab_index < len(raw_text):",
        "        _agnolab_char = raw_text[_agnolab_index]",
        "        if _agnolab_in_string:",
        "            _agnolab_parts.append(_agnolab_char)",
        "            if _agnolab_escape:",
        "                _agnolab_escape = False",
        "            elif _agnolab_char == '\\\\':",
        "                _agnolab_escape = True",
        "            elif _agnolab_char == '\"':",
        "                _agnolab_in_string = False",
        "            _agnolab_index += 1",
        "            continue",
        "        if _agnolab_char == '\"':",
        "            _agnolab_in_string = True",
        "            _agnolab_parts.append(_agnolab_char)",
        "            _agnolab_index += 1",
        "            continue",
        "        if _agnolab_char == '$' and _agnolab_index + 1 < len(raw_text) and (raw_text[_agnolab_index + 1].isalpha() or raw_text[_agnolab_index + 1] == '_'):",
        "            _agnolab_end = _agnolab_index + 2",
        "            while _agnolab_end < len(raw_text) and (raw_text[_agnolab_end].isalnum() or raw_text[_agnolab_end] == '_'):",
        "                _agnolab_end += 1",
        "            _agnolab_parts.append(json.dumps(f\"__agnolab_ctx__:{raw_text[_agnolab_index + 1:_agnolab_end]}\"))",
        "            _agnolab_index = _agnolab_end",
        "            continue",
        "        _agnolab_parts.append(_agnolab_char)",
        "        _agnolab_index += 1",
        "    return ''.join(_agnolab_parts)",
        "",
        "def _agnolab_parse_json_template(raw_text):",
        "    if not raw_text.strip():",
        "        return None",
        "    _agnolab_prepared_value = _agnolab_prepare_json_template(raw_text)",
        "    return _agnolab_resolve_template_value(json.loads(_agnolab_prepared_value))",
        "",
        "def _agnolab_stringify_value(value):",
        "    if value is None:",
        "        return ''",
        "    if isinstance(value, (dict, list)):",
        "        return json.dumps(value, ensure_ascii=False)",
        "    return str(value)",
        "",
        "def _agnolab_find_nested_string(payload, keys):",
        "    if isinstance(payload, dict):",
        "        for key in keys:",
        "            value = payload.get(key)",
        "            if isinstance(value, str) and value.strip():",
        "                return value.strip()",
        "        for value in payload.values():",
        "            found = _agnolab_find_nested_string(value, keys)",
        "            if found:",
        "                return found",
        "    elif isinstance(payload, list):",
        "        for item in payload:",
        "            found = _agnolab_find_nested_string(item, keys)",
        "            if found:",
        "                return found",
        "    return ''",
        "",
        "_agnolab_delivery = {'channel': _agnolab_output_mode, 'delivered': False}",
    ]

    if output_mode == "api":
        api_url = str(extras.get("apiUrl") or "").strip()
        bearer_token = str(extras.get("apiBearerToken") or "").strip()
        timeout_seconds = parse_timeout(extras.get("apiTimeoutSeconds"), default=15.0, label="API Output")
        headers_raw = str(extras.get("apiHeadersJson") or "").strip()
        payload_raw = str(extras.get("apiPayloadJson") or "").strip()
        headers_dict = parse_object_template(headers_raw, label="API Output additional headers JSON")

        if payload_raw and "$" not in payload_raw:
            parsed_payload = parse_json_if_needed(payload_raw)
            if parsed_payload is not None and not isinstance(parsed_payload, dict):
                warnings.append("API Output additional payload JSON must be an object; ignoring template errors until runtime.")

        if not api_url:
            warnings.append("API Output node has no URL configured; execution will only print the generated result.")

        lines.extend(
            [
                f"_agnolab_api_url = {python_literal(api_url)}",
                f"_agnolab_api_bearer_token = {python_literal(bearer_token)}",
                f"_agnolab_api_timeout = {timeout_seconds}",
                f"_agnolab_api_extra_headers = {python_literal(headers_dict)}",
                f"_agnolab_api_payload_raw = {python_literal(payload_raw)}",
                "if not _agnolab_api_url:",
                "    _agnolab_delivery['error'] = 'API URL not configured.'",
                "else:",
                "    _agnolab_api_headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}",
                "    if _agnolab_api_extra_headers:",
                "        _agnolab_api_headers.update(_agnolab_api_extra_headers)",
                "    if _agnolab_api_bearer_token:",
                "        _agnolab_api_headers['Authorization'] = f\"Bearer {_agnolab_api_bearer_token}\"",
                "    _agnolab_api_extra_payload = None",
                "    _agnolab_api_payload_template_error = None",
                "    if _agnolab_api_payload_raw.strip():",
                "        try:",
                "            _agnolab_api_extra_payload = _agnolab_parse_json_template(_agnolab_api_payload_raw)",
                "            if _agnolab_api_extra_payload is not None and not isinstance(_agnolab_api_extra_payload, dict):",
                "                raise ValueError('Additional payload must resolve to a JSON object.')",
                "        except Exception as exc:",
                "            _agnolab_api_payload_template_error = str(exc)",
                "            _agnolab_api_extra_payload = None",
                "    _agnolab_api_payload = {",
                "        'success': True,",
                "        'data': {",
                f"            'flow': {{'project': {python_literal(project_name)}, 'node': {python_literal(node.data.name)}, 'type': 'output_api', 'mode': 'api'}},",
                "            'input': flow_input_payload,",
                "            'result': {'text': flow_result_text},",
                "        },",
                "        'meta': {'source': 'agnolab', 'timestamp': _agnolab_delivery_timestamp},",
                "    }",
                "    if _agnolab_api_payload_template_error:",
                "        _agnolab_api_payload['meta']['payload_template_error'] = _agnolab_api_payload_template_error",
                "    if _agnolab_api_extra_payload is not None:",
                "        _agnolab_api_payload['extra'] = _agnolab_api_extra_payload",
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
                "        _agnolab_delivery = {",
                "            'channel': 'api',",
                "            'delivered': _agnolab_api_response.ok,",
                "            'status_code': _agnolab_api_response.status_code,",
                "            'response': _agnolab_api_response_body,",
                "        }",
                "    except Exception as exc:",
                "        _agnolab_delivery = {'channel': 'api', 'delivered': False, 'error': str(exc)}",
            ]
        )
    elif output_mode == "email":
        email_security = str(extras.get("emailSecurity") or "starttls").strip().lower()
        if email_security not in {"ssl", "starttls", "none"}:
            warnings.append("Email Send Output security is invalid; falling back to STARTTLS.")
            email_security = "starttls"
        email_host = str(extras.get("emailHost") or "").strip()
        email_from = str(extras.get("emailFrom") or "").strip()
        email_to = str(extras.get("emailTo") or "").strip()
        email_timeout = parse_timeout(extras.get("emailTimeoutSeconds"), default=15.0, label="Email Send Output")
        email_port_default = 465 if email_security == "ssl" else 587
        try:
            email_port = int(str(extras.get("emailPort") or "").strip() or email_port_default)
        except (TypeError, ValueError):
            warnings.append("Email Send Output port is invalid; using the default SMTP port.")
            email_port = email_port_default
        if email_port <= 0:
            warnings.append("Email Send Output port must be greater than zero; using the default SMTP port.")
            email_port = email_port_default
        email_attach_input_files = parse_bool(extras.get("emailAttachInputFiles"), default=False)

        if not email_host or not email_from or not email_to:
            warnings.append("Email Send Output requires host, from, and to addresses.")

        lines.extend(
            [
                "import smtplib",
                "import ssl",
                "from email.message import EmailMessage",
                f"_agnolab_email_host = {python_literal(email_host)}",
                f"_agnolab_email_port = {email_port}",
                f"_agnolab_email_security = {python_literal(email_security)}",
                f"_agnolab_email_username = {python_literal(str(extras.get('emailUsername') or '').strip())}",
                f"_agnolab_email_password = {python_literal(str(extras.get('emailPassword') or ''))}",
                f"_agnolab_email_from = {python_literal(email_from)}",
                f"_agnolab_email_to = {python_literal(email_to)}",
                f"_agnolab_email_cc = {python_literal(str(extras.get('emailCc') or '').strip())}",
                f"_agnolab_email_bcc = {python_literal(str(extras.get('emailBcc') or '').strip())}",
                f"_agnolab_email_subject = {python_literal(str(extras.get('emailSubject') or 'Flow result for $flow_name'))}",
                f"_agnolab_email_body_template = {python_literal(str(extras.get('emailBodyTemplate') or '$result_text'))}",
                f"_agnolab_email_timeout = {email_timeout}",
                f"_agnolab_email_attach_input_files = {email_attach_input_files}",
                "if not _agnolab_email_host or not _agnolab_email_from or not _agnolab_email_to:",
                "    _agnolab_delivery = {'channel': 'email', 'delivered': False, 'error': 'SMTP host, from, or recipient is not configured.'}",
                "else:",
                "    _agnolab_email_message = EmailMessage()",
                "    _agnolab_email_message['Subject'] = _agnolab_replace_context_tokens(_agnolab_email_subject)",
                "    _agnolab_email_message['From'] = _agnolab_replace_context_tokens(_agnolab_email_from)",
                "    _agnolab_email_message['To'] = _agnolab_replace_context_tokens(_agnolab_email_to)",
                "    if _agnolab_email_cc:",
                "        _agnolab_email_message['Cc'] = _agnolab_replace_context_tokens(_agnolab_email_cc)",
                "    if _agnolab_email_bcc:",
                "        _agnolab_email_message['Bcc'] = _agnolab_replace_context_tokens(_agnolab_email_bcc)",
                "    _agnolab_email_message.set_content(_agnolab_replace_context_tokens(_agnolab_email_body_template or '$result_text'))",
                "    if _agnolab_email_attach_input_files:",
                "        for _agnolab_file in flow_input_files:",
                "            _agnolab_file_path = _agnolab_file.get('path')",
                "            if not _agnolab_file_path:",
                "                continue",
                "            _agnolab_file_bytes = Path(_agnolab_file_path).read_bytes()",
                "            _agnolab_mime_type = str(_agnolab_file.get('mime_type') or 'application/octet-stream')",
                "            _agnolab_maintype, _agnolab_separator, _agnolab_subtype = _agnolab_mime_type.partition('/')",
                "            if not _agnolab_separator:",
                "                _agnolab_maintype, _agnolab_subtype = 'application', 'octet-stream'",
                "            _agnolab_email_message.add_attachment(",
                "                _agnolab_file_bytes,",
                "                maintype=_agnolab_maintype or 'application',",
                "                subtype=_agnolab_subtype or 'octet-stream',",
                "                filename=str(_agnolab_file.get('name') or Path(_agnolab_file_path).name),",
                "            )",
                "    _agnolab_smtp_client = None",
                "    try:",
                "        if _agnolab_email_security == 'ssl':",
                "            _agnolab_smtp_client = smtplib.SMTP_SSL(",
                "                _agnolab_email_host,",
                "                _agnolab_email_port,",
                "                timeout=_agnolab_email_timeout,",
                "                context=ssl.create_default_context(),",
                "            )",
                "        else:",
                "            _agnolab_smtp_client = smtplib.SMTP(_agnolab_email_host, _agnolab_email_port, timeout=_agnolab_email_timeout)",
                "            if _agnolab_email_security == 'starttls':",
                "                _agnolab_smtp_client.starttls(context=ssl.create_default_context())",
                "        if _agnolab_email_username:",
                "            _agnolab_smtp_client.login(_agnolab_email_username, _agnolab_email_password)",
                "        _agnolab_smtp_client.send_message(_agnolab_email_message)",
                "        _agnolab_delivery = {",
                "            'channel': 'email',",
                "            'delivered': True,",
                "            'to': _agnolab_email_message.get('To', ''),",
                "            'subject': _agnolab_email_message.get('Subject', ''),",
                "        }",
                "    except Exception as exc:",
                "        _agnolab_delivery = {'channel': 'email', 'delivered': False, 'error': str(exc)}",
                "    finally:",
                "        if _agnolab_smtp_client is not None:",
                "            try:",
                "                _agnolab_smtp_client.quit()",
                "            except Exception:",
                "                pass",
            ]
        )
    elif output_mode == "chat":
        chat_provider = str(extras.get("chatProvider") or "slack").strip().lower()
        if chat_provider not in {"slack", "discord", "telegram", "generic", "whatsapp"}:
            warnings.append("Chat Message Output provider is invalid; falling back to Slack webhook.")
            chat_provider = "slack"
        chat_timeout = parse_timeout(extras.get("chatTimeoutSeconds"), default=15.0, label="Chat Message Output")
        chat_headers_raw = str(extras.get("chatHeadersJson") or "").strip()
        chat_headers_dict = parse_object_template(chat_headers_raw, label="Chat Message Output additional headers JSON")
        if chat_provider == "telegram":
            if not str(extras.get("chatBotToken") or "").strip() or not str(extras.get("chatChannelId") or "").strip():
                warnings.append("Chat Message Output with Telegram requires bot token and chat id.")
        elif chat_provider == "whatsapp":
            if not str(extras.get("chatWhatsappSessionId") or "").strip() or not str(extras.get("chatChannelId") or "").strip():
                warnings.append("Chat Message Output with WhatsApp requires a session id and target phone or chat id.")
        elif not str(extras.get("chatWebhookUrl") or "").strip():
            warnings.append("Chat Message Output requires a webhook URL for the selected provider.")

        lines.extend(
            [
                f"_agnolab_chat_provider = {python_literal(chat_provider)}",
                f"_agnolab_chat_webhook_url = {python_literal(str(extras.get('chatWebhookUrl') or '').strip())}",
                f"_agnolab_chat_bot_token = {python_literal(str(extras.get('chatBotToken') or '').strip())}",
                f"_agnolab_chat_channel_id = {python_literal(str(extras.get('chatChannelId') or '').strip())}",
                f"_agnolab_chat_whatsapp_session_id = {python_literal(str(extras.get('chatWhatsappSessionId') or '').strip())}",
                f"_agnolab_chat_message_template = {python_literal(str(extras.get('chatMessageTemplate') or '$result_text'))}",
                f"_agnolab_chat_headers = {python_literal(chat_headers_dict)}",
                f"_agnolab_chat_timeout = {chat_timeout}",
                "_agnolab_chat_message = _agnolab_replace_context_tokens(_agnolab_chat_message_template or '$result_text')",
                "try:",
                "    if _agnolab_chat_provider == 'telegram':",
                "        if not _agnolab_chat_bot_token or not _agnolab_chat_channel_id:",
                "            raise ValueError('Telegram output requires bot token and chat id.')",
                "        _agnolab_chat_response = requests.post(",
                "            f\"https://api.telegram.org/bot{_agnolab_chat_bot_token}/sendMessage\",",
                "            json={'chat_id': _agnolab_replace_context_tokens(_agnolab_chat_channel_id), 'text': _agnolab_chat_message},",
                "            timeout=_agnolab_chat_timeout,",
                "        )",
                "    elif _agnolab_chat_provider == 'whatsapp':",
                "        _agnolab_whatsapp_session_id = _agnolab_replace_context_tokens(_agnolab_chat_whatsapp_session_id)",
                "        _agnolab_whatsapp_target = _agnolab_replace_context_tokens(_agnolab_chat_channel_id)",
                "        if not _agnolab_whatsapp_session_id or not _agnolab_whatsapp_target:",
                "            raise ValueError('WhatsApp output requires a session id and target phone or chat id.')",
                "        _agnolab_whatsapp_base_url = (os.getenv('WHATSAPP_GATEWAY_BASE_URL') or 'http://whatsapp:21465').rstrip('/')",
                "        _agnolab_whatsapp_secret = (os.getenv('WHATSAPP_GATEWAY_SECRET_KEY') or 'agnolab_wppconnect_secret').strip()",
                "        _agnolab_whatsapp_is_group = _agnolab_whatsapp_target.endswith('@g.us')",
                "        if not _agnolab_whatsapp_is_group and '@' in _agnolab_whatsapp_target:",
                "            _agnolab_whatsapp_target = _agnolab_whatsapp_target.split('@', 1)[0]",
                "        if not _agnolab_whatsapp_is_group:",
                "            _agnolab_whatsapp_digits = ''.join(char for char in _agnolab_whatsapp_target if char.isdigit())",
                "            _agnolab_whatsapp_target = _agnolab_whatsapp_digits or _agnolab_whatsapp_target",
                "        _agnolab_whatsapp_token_response = requests.post(",
                "            f\"{_agnolab_whatsapp_base_url}/api/{_agnolab_whatsapp_session_id}/{_agnolab_whatsapp_secret}/generate-token\",",
                "            timeout=_agnolab_chat_timeout,",
                "        )",
                "        _agnolab_whatsapp_token_response.raise_for_status()",
                "        try:",
                "            _agnolab_whatsapp_token_payload = _agnolab_whatsapp_token_response.json()",
                "        except ValueError as exc:",
                "            raise ValueError('WhatsApp gateway did not return JSON while generating the session token.') from exc",
                "        _agnolab_whatsapp_token = _agnolab_find_nested_string(_agnolab_whatsapp_token_payload, ('token', 'access_token', 'bearer', 'jwt'))",
                "        if not _agnolab_whatsapp_token:",
                "            raise ValueError('WhatsApp gateway did not return a usable session token.')",
                "        _agnolab_chat_response = requests.post(",
                "            f\"{_agnolab_whatsapp_base_url}/api/{_agnolab_whatsapp_session_id}/send-message\",",
                "            headers={'Authorization': f\"Bearer {_agnolab_whatsapp_token}\"},",
                "            json={'phone': _agnolab_whatsapp_target, 'message': _agnolab_chat_message, 'isGroup': _agnolab_whatsapp_is_group},",
                "            timeout=_agnolab_chat_timeout,",
                "        )",
                "    else:",
                "        if not _agnolab_chat_webhook_url:",
                "            raise ValueError('Webhook URL is not configured.')",
                "        _agnolab_chat_payload = {'text': _agnolab_chat_message}",
                "        if _agnolab_chat_provider == 'discord':",
                "            _agnolab_chat_payload = {'content': _agnolab_chat_message}",
                "        elif _agnolab_chat_provider == 'generic':",
                "            _agnolab_chat_payload = {",
                "                'text': _agnolab_chat_message,",
                "                'result': flow_result_text,",
                "                'metadata': flow_input_metadata,",
                f"                'flow': {{'project': {python_literal(project_name)}, 'node': {python_literal(node.data.name)}}},",
                "            }",
                "        _agnolab_chat_response = requests.post(",
                "            _agnolab_chat_webhook_url,",
                "            headers={'Accept': 'application/json', 'Content-Type': 'application/json', **_agnolab_chat_headers},",
                "            json=_agnolab_chat_payload,",
                "            timeout=_agnolab_chat_timeout,",
                "        )",
                "    try:",
                "        _agnolab_chat_response_body = _agnolab_chat_response.json()",
                "    except ValueError:",
                "        _agnolab_chat_response_body = _agnolab_chat_response.text",
                "    _agnolab_delivery = {",
                "        'channel': 'chat',",
                "        'provider': _agnolab_chat_provider,",
                "        'delivered': _agnolab_chat_response.ok,",
                "        'status_code': _agnolab_chat_response.status_code,",
                "        'response': _agnolab_chat_response_body,",
                "    }",
                "except Exception as exc:",
                "    _agnolab_delivery = {'channel': 'chat', 'provider': _agnolab_chat_provider, 'delivered': False, 'error': str(exc)}",
            ]
        )
    else:
        sheet_file_path = str(extras.get("sheetFilePath") or "").strip()
        sheet_include_header = parse_bool(extras.get("sheetIncludeHeader"), default=True)
        sheet_row_raw = str(extras.get("sheetRowJson") or "").strip()
        if not sheet_file_path:
            warnings.append("Spreadsheet Output requires a CSV file path.")
        if sheet_row_raw and "$" not in sheet_row_raw:
            parsed_row = parse_json_if_needed(sheet_row_raw)
            if parsed_row is not None and not isinstance(parsed_row, dict):
                warnings.append("Spreadsheet Output row JSON must be an object; runtime will fall back to a default row.")

        lines.extend(
            [
                "import csv",
                f"_agnolab_sheet_file_path = {python_literal(sheet_file_path)}",
                f"_agnolab_sheet_include_header = {sheet_include_header}",
                f"_agnolab_sheet_row_raw = {python_literal(sheet_row_raw)}",
                "if not _agnolab_sheet_file_path:",
                "    _agnolab_delivery = {'channel': 'spreadsheet', 'delivered': False, 'error': 'CSV file path not configured.'}",
                "else:",
                "    _agnolab_sheet_row = None",
                "    _agnolab_sheet_row_error = None",
                "    if _agnolab_sheet_row_raw.strip():",
                "        try:",
                "            _agnolab_sheet_row = _agnolab_parse_json_template(_agnolab_sheet_row_raw)",
                "            if _agnolab_sheet_row is not None and not isinstance(_agnolab_sheet_row, dict):",
                "                raise ValueError('Spreadsheet row must resolve to a JSON object.')",
                "        except Exception as exc:",
                "            _agnolab_sheet_row_error = str(exc)",
                "            _agnolab_sheet_row = None",
                "    if _agnolab_sheet_row is None:",
                "        _agnolab_sheet_row = {'timestamp': _agnolab_delivery_timestamp, 'flow_name': _agnolab_context_value('flow_name'), 'result': flow_result_text}",
                "    _agnolab_sheet_path = Path(_agnolab_sheet_file_path)",
                "    _agnolab_sheet_path.parent.mkdir(parents=True, exist_ok=True)",
                "    _agnolab_sheet_row_serialized = {str(key): _agnolab_stringify_value(value) for key, value in _agnolab_sheet_row.items()}",
                "    _agnolab_write_header = _agnolab_sheet_include_header and (not _agnolab_sheet_path.exists() or _agnolab_sheet_path.stat().st_size == 0)",
                "    with _agnolab_sheet_path.open('a', encoding='utf-8', newline='') as _agnolab_sheet_file:",
                "        _agnolab_sheet_writer = csv.DictWriter(_agnolab_sheet_file, fieldnames=list(_agnolab_sheet_row_serialized.keys()))",
                "        if _agnolab_write_header:",
                "            _agnolab_sheet_writer.writeheader()",
                "        _agnolab_sheet_writer.writerow(_agnolab_sheet_row_serialized)",
                "    _agnolab_delivery = {",
                "        'channel': 'spreadsheet',",
                "        'delivered': True,",
                "        'path': str(_agnolab_sheet_path.resolve()),",
                "        'row': _agnolab_sheet_row_serialized,",
                "    }",
                "    if _agnolab_sheet_row_error:",
                "        _agnolab_delivery['warning'] = _agnolab_sheet_row_error",
            ]
        )

    lines.append("print(json.dumps({'result': flow_result_text, 'delivery': _agnolab_delivery}, ensure_ascii=False))")

    return lines, warnings


def get_knowledge_reader_filters(reader_key: str | None) -> tuple[list[str], list[str]]:
    if reader_key == "pdf":
        return [".pdf"], ["application/pdf"]
    if reader_key in {"csv", "field_labeled_csv"}:
        return [".csv"], ["text/csv"]
    if reader_key == "excel":
        return [".xlsx", ".xls"], [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ]
    if reader_key == "docx":
        return [".docx", ".doc"], [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
        ]
    if reader_key == "pptx":
        return [".pptx"], ["application/vnd.openxmlformats-officedocument.presentationml.presentation"]
    if reader_key == "json":
        return [".json"], ["application/json"]
    if reader_key == "markdown":
        return [".md", ".markdown"], ["text/markdown", "text/x-markdown", "text/md"]
    if reader_key == "text":
        return [".txt", ".text", ".tsv", ".xml", ".yaml", ".yml"], ["text/plain", "text/tab-separated-values", "text/xml"]
    return [
        ".pdf",
        ".csv",
        ".xlsx",
        ".xls",
        ".docx",
        ".doc",
        ".pptx",
        ".json",
        ".md",
        ".markdown",
        ".txt",
        ".text",
        ".tsv",
        ".xml",
        ".yaml",
        ".yml",
    ], [
        "application/pdf",
        "text/csv",
        "application/json",
        "text/plain",
        "text/markdown",
        "text/x-markdown",
        "text/md",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/xml",
        "text/tab-separated-values",
    ]


def render_knowledge_file_ingestion(knowledge_targets: list[dict[str, object]]) -> list[str]:
    if not knowledge_targets:
        return []

    lines = [
        "_agnolab_knowledge_targets = []",
    ]

    for target in knowledge_targets:
        owner_symbol = str(target.get("owner_symbol") or "")
        reader_expr = target.get("reader_expr")
        reader_extensions = target.get("reader_extensions") or []
        reader_mime_types = target.get("reader_mime_types") or []
        static_text = str(target.get("static_text") or "")
        static_urls = target.get("static_urls") or []
        ingest_attached_files = bool(target.get("ingest_attached_files", True))
        ingest_input_text = bool(target.get("ingest_input_text", False))

        if not owner_symbol:
            continue

        lines.extend(
            [
                f"if getattr({owner_symbol}, 'knowledge', None) is not None:",
                "    _agnolab_knowledge_targets.append({",
                f"        'knowledge': {owner_symbol}.knowledge,",
                f"        'reader': {reader_expr if isinstance(reader_expr, str) and reader_expr else 'None'},",
                f"        'ingest_attached_files': {ingest_attached_files},",
                f"        'ingest_input_text': {ingest_input_text},",
                f"        'static_text': {python_literal(static_text)},",
                f"        'static_urls': {python_literal(static_urls)},",
                f"        'reader_extensions': {python_literal(reader_extensions)},",
                f"        'reader_mime_types': {python_literal(reader_mime_types)},",
                "    })",
            ]
        )

    lines.extend(
        [
            "_agnolab_seen_knowledge_ids = set()",
            "for _agnolab_target in _agnolab_knowledge_targets:",
            "    _agnolab_knowledge = _agnolab_target.get('knowledge')",
            "    if _agnolab_knowledge is None:",
            "        continue",
            "    _agnolab_knowledge_id = id(_agnolab_knowledge)",
            "    if _agnolab_knowledge_id in _agnolab_seen_knowledge_ids:",
            "        continue",
            "    _agnolab_seen_knowledge_ids.add(_agnolab_knowledge_id)",
            "    _agnolab_reader = _agnolab_target.get('reader')",
            "    _agnolab_allowed_extensions = {str(value).lower() for value in (_agnolab_target.get('reader_extensions') or [])}",
            "    _agnolab_allowed_mime_types = {str(value).lower() for value in (_agnolab_target.get('reader_mime_types') or [])}",
            "    if _agnolab_target.get('ingest_attached_files'):",
            "        for _agnolab_file in flow_input_files:",
            "            _agnolab_file_path = _agnolab_file.get('path')",
            "            if not _agnolab_file_path:",
            "                continue",
            "            _agnolab_file_ext = Path(_agnolab_file_path).suffix.lower()",
            "            _agnolab_file_mime = str(_agnolab_file.get('mime_type') or '').strip().lower()",
            "            if _agnolab_allowed_extensions or _agnolab_allowed_mime_types:",
            "                _agnolab_file_supported = (_agnolab_file_ext in _agnolab_allowed_extensions) or (_agnolab_file_mime in _agnolab_allowed_mime_types)",
            "                if not _agnolab_file_supported:",
            "                    continue",
            "            _agnolab_insert_kwargs = {",
            "                'path': _agnolab_file_path,",
            "                'metadata': {",
            "                    'source': 'flow_input_file',",
            "                    'file_name': _agnolab_file.get('name') or '',",
            "                    'file_alias': _agnolab_file.get('alias') or '',",
            "                    'mime_type': _agnolab_file.get('mime_type') or '',",
            "                },",
            "                'skip_if_exists': True,",
            "            }",
            "            if _agnolab_reader is not None:",
            "                _agnolab_insert_kwargs['reader'] = _agnolab_reader",
            "            _agnolab_knowledge.insert(**_agnolab_insert_kwargs)",
            "    if _agnolab_target.get('ingest_input_text') and flow_input_payload.get('text'):",
            "        _agnolab_knowledge.insert(",
            "            name='flow_input_text',",
            "            text_content=flow_input_payload['text'],",
            "            metadata={'source': 'flow_input_text'},",
            "            skip_if_exists=True,",
            "        )",
            "    _agnolab_static_text = str(_agnolab_target.get('static_text') or '').strip()",
            "    if _agnolab_static_text:",
            "        _agnolab_knowledge.insert(",
            "            name='static_knowledge_text',",
            "            text_content=_agnolab_static_text,",
            "            metadata={'source': 'knowledge_static_text'},",
            "            skip_if_exists=True,",
            "        )",
            "    for _agnolab_url in (_agnolab_target.get('static_urls') or []):",
            "        if not _agnolab_url:",
            "            continue",
            "        _agnolab_knowledge.insert(",
            "            url=_agnolab_url,",
            "            metadata={'source': 'knowledge_static_url', 'url': _agnolab_url},",
            "            skip_if_exists=True,",
            "        )",
            "",
        ]
    )

    return lines


def compile_graph(graph: CanvasGraph) -> tuple[str, list[str]]:
    warnings: list[str] = []

    if graph.project.target != TargetRuntime.AGNO_PYTHON:
        warnings.append("Target different from agno-python is not implemented yet; using agno-python preview.")

    ordered_nodes = topological_nodes(graph)
    node_map = {node.id: node for node in graph.nodes}
    provider_import_lines, provider_class_refs, provider_warnings = collect_provider_imports(graph, ordered_nodes)
    raw_expression_import_lines = collect_raw_expression_imports(ordered_nodes)
    warnings.extend(provider_warnings)
    has_output_api = any(node.type == NodeType.OUTPUT_API for node in ordered_nodes)
    has_workflow_nodes = any(node.type in {NodeType.WORKFLOW, NodeType.WORKFLOW_STEP} for node in ordered_nodes)
    has_direct_vector_db_runner_link = any(
        node_map.get(edge.source) and node_map.get(edge.target)
        and node_map[edge.source].type == NodeType.VECTOR_DB
        and node_map[edge.target].type in {NodeType.AGENT, NodeType.TEAM}
        for edge in graph.edges
    )
    lines: list[str] = []
    import_lines: list[str] = [HEADER_TEMPLATE.render().rstrip()]
    tool_imports: set[tuple[str, str]] = set()
    needs_tool_decorator = False
    symbol_map: dict[str, str] = {}
    knowledge_target_specs: list[dict[str, object]] = []
    knowledge_reader_imports: set[tuple[str, str]] = set()
    interface_imports: set[tuple[str, str]] = set()

    def register_knowledge_target(owner_symbol: str, knowledge_node: GraphNode | None = None) -> None:
        extras = knowledge_node.data.extras if knowledge_node else {}
        if not isinstance(extras, dict):
            extras = {}

        reader_key = str(extras.get("knowledgeReader") or "auto").strip().lower()
        reader_expr = build_knowledge_reader_expression(extras)
        if reader_key in KNOWLEDGE_READER_IMPORTS:
            knowledge_reader_imports.add(KNOWLEDGE_READER_IMPORTS[reader_key])
        reader_extensions, reader_mime_types = get_knowledge_reader_filters(reader_key if reader_expr else None)
        static_urls = [line.strip() for line in str(extras.get("staticUrls") or "").splitlines() if line.strip()]

        knowledge_target_specs.append(
            {
                "owner_symbol": owner_symbol,
                "reader_expr": reader_expr,
                "reader_extensions": reader_extensions,
                "reader_mime_types": reader_mime_types,
                "ingest_attached_files": bool(extras.get("ingestAttachedFiles", True)),
                "ingest_input_text": bool(extras.get("ingestInputText", False)),
                "static_text": str(extras.get("staticText") or ""),
                "static_urls": static_urls,
            }
        )

    def get_workflow_step_order(step_node: GraphNode) -> tuple[int, float, float, str]:
        extras = step_node.data.extras or {}
        raw_order = extras.get("stepOrder")
        try:
            step_order = int(raw_order)
        except (TypeError, ValueError):
            step_order = 9999
        return (
            step_order,
            step_node.position.x,
            step_node.position.y,
            step_node.data.name or step_node.id,
        )

    for node in ordered_nodes:
        var_name = sanitize_identifier(f"{node.type.value}_{node.id}")
        symbol_map[node.id] = var_name

        if node.type == NodeType.TOOL:
            tool_lines, node_imports, needs_decorator = render_tool_node(node, var_name, graph=graph)
            tool_imports.update(node_imports)
            needs_tool_decorator = needs_tool_decorator or needs_decorator
            lines.extend(tool_lines)
            continue

        if node.type in {
            NodeType.DATABASE,
            NodeType.VECTOR_DB,
            NodeType.KNOWLEDGE,
            NodeType.SKILLS,
            NodeType.LEARNING_MACHINE,
            NodeType.MEMORY_MANAGER,
            NodeType.SESSION_SUMMARY_MANAGER,
            NodeType.COMPRESSION_MANAGER,
        }:
            lines.extend(render_resource_node(node, var_name, graph, symbol_map, provider_class_refs))
            continue

        if node.type == NodeType.INTERFACE:
            interface_lines, node_interface_imports, interface_warnings = render_interface_node(
                node,
                var_name,
                graph,
                node_map,
                symbol_map,
            )
            interface_imports.update(node_interface_imports)
            warnings.extend(interface_warnings)
            lines.extend(interface_lines)
            continue

        if node.type == NodeType.AGENT:
            provider_id = get_node_provider_id(node)
            incoming_source_ids = incoming_ids(graph, node.id)
            tool_symbols = [
                symbol_map[source_id]
                for source_id in incoming_source_ids
                if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.TOOL
            ]
            connected_db_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.DATABASE
                ),
                None,
            )
            connected_knowledge_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.KNOWLEDGE
                ),
                None,
            )
            connected_knowledge_node = next(
                (
                    node_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.KNOWLEDGE
                ),
                None,
            )
            connected_skills_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.SKILLS
                ),
                None,
            )
            connected_skills_node = next(
                (
                    node_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.SKILLS
                ),
                None,
            )
            connected_vector_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.VECTOR_DB
                ),
                None,
            )
            connected_memory_manager_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.MEMORY_MANAGER
                ),
                None,
            )
            connected_session_summary_manager_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.SESSION_SUMMARY_MANAGER
                ),
                None,
            )
            connected_compression_manager_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.COMPRESSION_MANAGER
                ),
                None,
            )
            connected_learning_machine_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.LEARNING_MACHINE
                ),
                None,
            )
            env_setup_lines = build_provider_env_setup(node)
            if env_setup_lines:
                lines.extend(env_setup_lines)
            provider_class_ref = provider_class_refs.get(provider_id)
            excluded_fields: set[str] = set()
            if connected_db_symbol:
                excluded_fields.add("db")
            if connected_knowledge_symbol or connected_vector_symbol:
                excluded_fields.add("knowledge")
            if connected_skills_symbol:
                excluded_fields.add("skills")
            if connected_memory_manager_symbol:
                excluded_fields.add("memory_manager")
            if connected_session_summary_manager_symbol:
                excluded_fields.add("session_summary_manager")
            if connected_compression_manager_symbol:
                excluded_fields.add("compression_manager")
            if connected_learning_machine_symbol:
                excluded_fields.add("learning")
            extras = node.data.extras or {}
            agent_config = extras.get("agentConfig") or {}
            has_manual_skills = isinstance(agent_config, dict) and agent_config.get("skills") not in (None, "", [], {})
            extra_instruction_blocks: list[str] = []
            if connected_skills_symbol:
                extra_instruction_blocks.append(build_skills_usage_guidance(connected_skills_node))
            elif has_manual_skills:
                extra_instruction_blocks.append(build_skills_usage_guidance())
            agent_kwargs, agent_warnings = build_agent_kwargs(
                node,
                tool_symbols,
                provider_class_ref,
                excluded_fields,
                extra_instruction_blocks,
            )
            warnings.extend(agent_warnings)
            if connected_db_symbol:
                agent_kwargs += f"\n    db={connected_db_symbol},"
            if connected_knowledge_symbol:
                agent_kwargs += f"\n    knowledge={connected_knowledge_symbol},"
            elif connected_vector_symbol:
                agent_kwargs += f"\n    knowledge=Knowledge(vector_db={connected_vector_symbol}),"
            if connected_skills_symbol:
                agent_kwargs += f"\n    skills={connected_skills_symbol},"
            if connected_memory_manager_symbol:
                agent_kwargs += f"\n    memory_manager={connected_memory_manager_symbol},"
            if connected_session_summary_manager_symbol:
                agent_kwargs += f"\n    session_summary_manager={connected_session_summary_manager_symbol},"
            if connected_compression_manager_symbol:
                agent_kwargs += f"\n    compression_manager={connected_compression_manager_symbol},"
            if connected_learning_machine_symbol:
                agent_kwargs += f"\n    learning={connected_learning_machine_symbol},"
            has_manual_knowledge = isinstance(agent_config, dict) and agent_config.get("knowledge") not in (None, "", [], {})
            if connected_knowledge_symbol and connected_knowledge_node:
                register_knowledge_target(var_name, connected_knowledge_node)
            elif connected_vector_symbol or has_manual_knowledge:
                register_knowledge_target(var_name)
            lines.append(
                AGENT_TEMPLATE.render(
                    var_name=var_name,
                    kwargs=agent_kwargs,
                ).rstrip()
            )
            lines.append("")
            continue

        if node.type == NodeType.TEAM:
            provider_id = get_node_provider_id(node)
            incoming_source_ids = incoming_ids(graph, node.id)
            member_symbols = [
                symbol_map[source_id]
                for source_id in incoming_source_ids
                if source_id in symbol_map
                and node_map.get(source_id)
                and node_map[source_id].type in {NodeType.AGENT, NodeType.TEAM}
            ]
            tool_symbols = [
                symbol_map[source_id]
                for source_id in incoming_source_ids
                if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.TOOL
            ]
            connected_db_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.DATABASE
                ),
                None,
            )
            connected_knowledge_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.KNOWLEDGE
                ),
                None,
            )
            connected_knowledge_node = next(
                (
                    node_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.KNOWLEDGE
                ),
                None,
            )
            connected_vector_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.VECTOR_DB
                ),
                None,
            )
            connected_memory_manager_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.MEMORY_MANAGER
                ),
                None,
            )
            connected_session_summary_manager_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.SESSION_SUMMARY_MANAGER
                ),
                None,
            )
            connected_compression_manager_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.COMPRESSION_MANAGER
                ),
                None,
            )
            connected_learning_machine_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.LEARNING_MACHINE
                ),
                None,
            )
            env_setup_lines = build_provider_env_setup(node)
            if env_setup_lines:
                lines.extend(env_setup_lines)
            provider_class_ref = provider_class_refs.get(provider_id)
            excluded_fields: set[str] = set()
            if connected_db_symbol:
                excluded_fields.add("db")
            if connected_knowledge_symbol or connected_vector_symbol:
                excluded_fields.add("knowledge")
            if connected_memory_manager_symbol:
                excluded_fields.add("memory_manager")
            if connected_session_summary_manager_symbol:
                excluded_fields.add("session_summary_manager")
            if connected_compression_manager_symbol:
                excluded_fields.add("compression_manager")
            if connected_learning_machine_symbol:
                excluded_fields.add("learning")
            team_kwargs, team_warnings = build_team_kwargs(node, member_symbols, tool_symbols, provider_class_ref, excluded_fields)
            warnings.extend(team_warnings)
            if connected_db_symbol:
                team_kwargs += f"\n    db={connected_db_symbol},"
            if connected_knowledge_symbol:
                team_kwargs += f"\n    knowledge={connected_knowledge_symbol},"
            elif connected_vector_symbol:
                team_kwargs += f"\n    knowledge=Knowledge(vector_db={connected_vector_symbol}),"
            if connected_memory_manager_symbol:
                team_kwargs += f"\n    memory_manager={connected_memory_manager_symbol},"
            if connected_session_summary_manager_symbol:
                team_kwargs += f"\n    session_summary_manager={connected_session_summary_manager_symbol},"
            if connected_compression_manager_symbol:
                team_kwargs += f"\n    compression_manager={connected_compression_manager_symbol},"
            if connected_learning_machine_symbol:
                team_kwargs += f"\n    learning={connected_learning_machine_symbol},"
            extras = node.data.extras or {}
            team_config = extras.get("teamConfig") or {}
            has_manual_knowledge = isinstance(team_config, dict) and team_config.get("knowledge") not in (None, "", [], {})
            if connected_knowledge_symbol and connected_knowledge_node:
                register_knowledge_target(var_name, connected_knowledge_node)
            elif connected_vector_symbol or has_manual_knowledge:
                register_knowledge_target(var_name)
            lines.append(
                TEAM_TEMPLATE.render(
                    var_name=var_name,
                    kwargs=team_kwargs,
                ).rstrip()
            )
            lines.append("")
            continue

        if node.type == NodeType.WORKFLOW_STEP:
            incoming_source_ids = incoming_ids(graph, node.id)
            connected_agent_ids = [
                source_id
                for source_id in incoming_source_ids
                if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.AGENT
            ]
            connected_team_ids = [
                source_id
                for source_id in incoming_source_ids
                if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.TEAM
            ]
            connected_tool_ids = [
                source_id
                for source_id in incoming_source_ids
                if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.TOOL
            ]
            connected_builtin_tool_ids = [
                source_id
                for source_id in connected_tool_ids
                if str((node_map[source_id].data.extras or {}).get("toolMode", "builtin")) == "builtin"
            ]
            connected_function_tool_ids = [
                source_id
                for source_id in connected_tool_ids
                if source_id not in connected_builtin_tool_ids
            ]
            connected_agent_symbol = symbol_map[connected_agent_ids[0]] if connected_agent_ids else None
            connected_team_symbol = symbol_map[connected_team_ids[0]] if connected_team_ids else None
            connected_executor_symbol: str | None = None
            primary_executor_label: str | None = None
            primary_builtin_tool_id: str | None = None
            if connected_agent_symbol:
                primary_executor_label = "Agent"
            elif connected_team_symbol:
                primary_executor_label = "Team"
            elif connected_function_tool_ids:
                connected_executor_symbol = symbol_map[connected_function_tool_ids[0]]
                primary_executor_label = "Function Tool"
            elif connected_builtin_tool_ids:
                primary_builtin_tool_id = connected_builtin_tool_ids[0]
                primary_executor_label = "Built-in Tool"
            additional_executor_labels: list[str] = []
            if connected_agent_ids:
                agent_labels = ["Agent" for _ in connected_agent_ids]
                if primary_executor_label == "Agent":
                    additional_executor_labels.extend(agent_labels[1:])
                else:
                    additional_executor_labels.extend(agent_labels)
            if connected_team_ids:
                team_labels = ["Team" for _ in connected_team_ids]
                if primary_executor_label == "Team":
                    additional_executor_labels.extend(team_labels[1:])
                else:
                    additional_executor_labels.extend(team_labels)
            if connected_function_tool_ids:
                tool_labels = ["Function Tool" for _ in connected_function_tool_ids]
                if primary_executor_label == "Function Tool":
                    additional_executor_labels.extend(tool_labels[1:])
                else:
                    additional_executor_labels.extend(tool_labels)
            if connected_builtin_tool_ids:
                tool_labels = ["Built-in Tool" for _ in connected_builtin_tool_ids]
                if primary_executor_label == "Built-in Tool":
                    additional_executor_labels.extend(tool_labels[1:])
                else:
                    additional_executor_labels.extend(tool_labels)
            if primary_builtin_tool_id:
                builtin_tool_var_name = sanitize_identifier(f"{var_name}_{primary_builtin_tool_id}_executor")
                builtin_tool_lines, builtin_tool_warnings = build_builtin_tool_workflow_executor(
                    step_node=node,
                    tool_node=node_map[primary_builtin_tool_id],
                    tool_symbol=symbol_map[primary_builtin_tool_id],
                    executor_var_name=builtin_tool_var_name,
                )
                warnings.extend(builtin_tool_warnings)
                if builtin_tool_lines:
                    lines.extend(builtin_tool_lines)
                    connected_executor_symbol = builtin_tool_var_name
            step_kwargs, step_warnings = build_workflow_step_kwargs(
                node,
                agent_symbol=connected_agent_symbol,
                team_symbol=connected_team_symbol,
                executor_symbol=connected_executor_symbol,
                executor_label=primary_executor_label,
                additional_executor_labels=additional_executor_labels,
            )
            warnings.extend(step_warnings)
            lines.append(
                STEP_TEMPLATE.render(
                    var_name=var_name,
                    kwargs=step_kwargs,
                ).rstrip()
            )
            lines.append("")
            continue

        if node.type == NodeType.WORKFLOW:
            incoming_source_ids = incoming_ids(graph, node.id)
            connected_db_symbol = next(
                (
                    symbol_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.DATABASE
                ),
                None,
            )
            connected_step_nodes = sorted(
                [
                    node_map[source_id]
                    for source_id in incoming_source_ids
                    if source_id in symbol_map and node_map.get(source_id) and node_map[source_id].type == NodeType.WORKFLOW_STEP
                ],
                key=get_workflow_step_order,
            )
            connected_step_symbols = [symbol_map[step_node.id] for step_node in connected_step_nodes if step_node.id in symbol_map]
            if not connected_step_symbols:
                warnings.append(f"Workflow '{node.data.name}' has no connected workflow steps.")
            excluded_fields: set[str] = set()
            if connected_db_symbol:
                excluded_fields.add("db")
            workflow_kwargs, workflow_warnings = build_workflow_kwargs(node, connected_step_symbols, excluded_fields)
            warnings.extend(workflow_warnings)
            if connected_db_symbol:
                workflow_kwargs += f"\n    db={connected_db_symbol},"
            lines.append(
                WORKFLOW_TEMPLATE.render(
                    var_name=var_name,
                    kwargs=workflow_kwargs,
                ).rstrip()
            )
            lines.append("")
            continue

    if needs_tool_decorator:
        import_lines.append("from agno.tools import tool")
    if has_workflow_nodes:
        import_lines.append("from agno.workflow import Step, Workflow")
    if has_direct_vector_db_runner_link:
        import_lines.append("from agno.knowledge.knowledge import Knowledge")
    for module, class_name in sorted(knowledge_reader_imports):
        import_lines.append(f"from {module} import {class_name}")
    for module, class_name in sorted(interface_imports):
        import_lines.append(f"from {module} import {class_name}")
    import_lines.extend(raw_expression_import_lines)
    import_lines.extend(provider_import_lines)
    for import_path, class_name in sorted(tool_imports):
        import_lines.append(f"from {import_path} import {class_name}")
    if has_output_api:
        import_lines.append("from datetime import datetime, timezone")
        import_lines.append("import requests")
    import_lines.append("")
    lines.extend(DEBUG_TRACE_HELPERS)

    input_nodes = [node for node in ordered_nodes if node.type in {NodeType.INPUT, *QUEUE_INPUT_NODE_TYPES}]
    terminal_nodes = [
        node for node in ordered_nodes if node.type in {NodeType.OUTPUT, NodeType.OUTPUT_API, *QUEUE_OUTPUT_NODE_TYPES}
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
    lines.append("_agnolab_media_kwargs = _agnolab_build_media_kwargs(flow_input_files)")
    lines.append("_agnolab_media_kwargs['__flow_input_metadata__'] = flow_input_metadata")
    lines.append("")
    lines.extend(render_knowledge_file_ingestion(knowledge_target_specs))

    if terminal_nodes:
        output_node = terminal_nodes[0]
        if len(terminal_nodes) > 1:
            warnings.append("Multiple output nodes found; using the first connected output in topological order.")

        upstream = [
            source_id
            for source_id in incoming_ids(graph, output_node.id)
            if node_map.get(source_id)
            and node_map[source_id].type in {
                NodeType.INPUT,
                *QUEUE_INPUT_NODE_TYPES,
                NodeType.AGENT,
                NodeType.TEAM,
                NodeType.WORKFLOW,
                NodeType.TOOL,
            }
        ]

        if len(upstream) > 1:
            node_type_priority = {
                NodeType.AGENT: 0,
                NodeType.TEAM: 1,
                NodeType.WORKFLOW: 2,
                NodeType.TOOL: 3,
                NodeType.INPUT: 4,
                NodeType.RABBITMQ_INPUT: 4,
                NodeType.KAFKA_INPUT: 4,
                NodeType.REDIS_INPUT: 4,
                NodeType.NATS_INPUT: 4,
                NodeType.SQS_INPUT: 4,
                NodeType.PUBSUB_INPUT: 4,
            }
            upstream = sorted(
                upstream,
                key=lambda source_id: (
                    node_type_priority.get(node_map[source_id].type, 99),
                    incoming_ids(graph, output_node.id).index(source_id),
                ),
            )

        producer_node = node_map.get(upstream[0]) if upstream else None
        producer_symbol = symbol_map.get(upstream[0]) if upstream else None
        if producer_node and producer_node.type in {NodeType.AGENT, NodeType.TEAM} and producer_symbol:
            lines.append(f"result = _agnolab_run_with_debug({producer_symbol}, flow_input, _agnolab_media_kwargs)")
            lines.append("flow_result_text = result.content if result is not None else ''")
        elif producer_node and producer_node.type == NodeType.WORKFLOW and producer_symbol:
            lines.append(f"result = _agnolab_run_workflow_with_debug({producer_symbol}, flow_input, _agnolab_media_kwargs)")
            lines.append("flow_result_text = _agnolab_workflow_result_text(result)")
        elif producer_node and producer_node.type == NodeType.TOOL and producer_symbol:
            lines.append(f"result = {producer_symbol}(flow_input)")
            lines.append("flow_result_text = str(result) if result is not None else ''")
        elif producer_node and producer_node.type in {NodeType.INPUT, *QUEUE_INPUT_NODE_TYPES}:
            lines.append("flow_result_text = str(flow_input_payload.get('text') or flow_input)")
        else:
            warnings.append("Output node has no valid upstream producer.")
            lines.append("flow_result_text = str(flow_input_payload.get('text') or flow_input)")

        lines.append(f"print({python_literal(RESULT_START_MARKER)})")
        lines.append("print(flow_result_text)")
        lines.append(f"print({python_literal(RESULT_END_MARKER)})")

        if output_node.type == NodeType.OUTPUT_API:
            output_lines, output_warnings = render_output_api_dispatch(output_node, project_name=graph.project.name)
            lines.extend(output_lines)
            warnings.extend(output_warnings)
        elif output_node.type in QUEUE_OUTPUT_NODE_TYPES:
            warnings.append(
                f"Queue output node '{output_node.data.name}' is configured in the canvas, but runtime dispatch is not implemented yet in generated code."
            )
    else:
        executable_types = {NodeType.AGENT, NodeType.TEAM, NodeType.WORKFLOW, NodeType.TOOL}
        executable_nodes = [node for node in ordered_nodes if node.type in executable_types]

        inferred_producer_node: GraphNode | None = None
        for candidate in reversed(executable_nodes):
            has_executable_downstream = any(
                edge.source == candidate.id
                and node_map.get(edge.target)
                and node_map[edge.target].type in executable_types
                for edge in graph.edges
            )
            if not has_executable_downstream:
                inferred_producer_node = candidate
                break

        if inferred_producer_node is None and executable_nodes:
            inferred_producer_node = executable_nodes[-1]

        inferred_symbol = symbol_map.get(inferred_producer_node.id) if inferred_producer_node else None
        if inferred_producer_node and inferred_producer_node.type in {NodeType.AGENT, NodeType.TEAM} and inferred_symbol:
            warnings.append(
                f"No output node found; inferring flow result from '{inferred_producer_node.data.name}' to support runtime integrations."
            )
            lines.append(f"result = _agnolab_run_with_debug({inferred_symbol}, flow_input, _agnolab_media_kwargs)")
            lines.append("flow_result_text = result.content if result is not None else ''")
        elif inferred_producer_node and inferred_producer_node.type == NodeType.WORKFLOW and inferred_symbol:
            warnings.append(
                f"No output node found; inferring flow result from workflow '{inferred_producer_node.data.name}' to support runtime integrations."
            )
            lines.append(f"result = _agnolab_run_workflow_with_debug({inferred_symbol}, flow_input, _agnolab_media_kwargs)")
            lines.append("flow_result_text = _agnolab_workflow_result_text(result)")
        elif inferred_producer_node and inferred_producer_node.type == NodeType.TOOL and inferred_symbol:
            warnings.append(
                f"No output node found; inferring flow result from Tool '{inferred_producer_node.data.name}' to support runtime integrations."
            )
            lines.append(f"result = {inferred_symbol}(flow_input)")
            lines.append("flow_result_text = str(result) if result is not None else ''")
        else:
            warnings.append("No output node found; preview uses the raw flow input.")
            lines.append("flow_result_text = str(flow_input_payload.get('text') or flow_input)")

        lines.append(f"print({python_literal(RESULT_START_MARKER)})")
        lines.append("print(flow_result_text)")
        lines.append(f"print({python_literal(RESULT_END_MARKER)})")

    full_code = "\n".join(import_lines + lines).strip() + "\n"
    return full_code, warnings
