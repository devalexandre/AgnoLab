from __future__ import annotations

from pathlib import Path

from .provider_catalog import build_provider_config
from .models import CanvasGraph, CanvasTemplateSummary, GraphEdge, GraphNode, NodeData, Position, ProjectMeta


REPO_ROOT = Path(__file__).resolve().parents[3]
EXAMPLE_SKILL_PATH = str((REPO_ROOT / "examples/skills/support-response-style").resolve())


def _input_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    text: str,
    source: str,
    input_mode: str = "text",
) -> GraphNode:
    return GraphNode(
        id=node_id,
        type="input",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            prompt=text,
            extras={
                "inputMode": input_mode,
                "inputText": text,
                "attachedFileName": "",
                "attachedFileAlias": "",
                "attachedFileMimeType": "",
                "attachedFileEncoding": "base64",
                "attachedFileBase64": "",
                "attachedFileContent": "",
                "payloadJson": '{\n  "source": "' + source + '"\n}',
                "hitlAutoApprove": "",
                "hitlUserInputJson": "",
            },
        ),
    )


def _database_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
    db_name: str = "agno",
    directory: str = "tmp",
) -> GraphNode:
    db_expression = f'SqliteDb(db_file="{directory}/{db_name}.db")'
    return GraphNode(
        id=node_id,
        type="database",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            extras={
                "dbPreset": "sqlite-db",
                "dbDirectory": directory,
                "dbName": db_name,
                "dbExpression": db_expression,
            },
        ),
    )


def _vector_db_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
    uri: str,
    table_name: str = "documents",
) -> GraphNode:
    vector_expression = f'LanceDb(uri="{uri}", table_name="{table_name}")'
    return GraphNode(
        id=node_id,
        type="vector_db",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            extras={
                "vectorPreset": "lancedb",
                "vectorUri": uri,
                "vectorTableName": table_name,
                "vectorExpression": vector_expression,
            },
        ),
    )


def _knowledge_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
    vector_expression: str,
    max_results: int = 8,
    reader: str = "auto",
    ingest_attached_files: bool = True,
    ingest_input_text: bool = False,
    static_text: str = "",
    static_urls: list[str] | None = None,
) -> GraphNode:
    urls = static_urls or []
    knowledge_expression = (
        f'Knowledge(name="{name}", description="{description}", vector_db={vector_expression}, max_results={max_results})'
    )
    return GraphNode(
        id=node_id,
        type="knowledge",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            extras={
                "knowledgeName": name,
                "knowledgeDescription": description,
                "knowledgeMaxResults": str(max_results),
                "knowledgeIsolateVectorSearch": False,
                "knowledgeReader": reader,
                "knowledgeSplitOnPages": True,
                "knowledgePassword": "",
                "knowledgeExcelSheets": "",
                "knowledgeCsvChunkTitle": "",
                "knowledgeCsvFieldNames": "",
                "knowledgeCsvFormatHeaders": True,
                "knowledgeCsvSkipEmptyFields": True,
                "ingestAttachedFiles": ingest_attached_files,
                "ingestInputText": ingest_input_text,
                "staticText": static_text,
                "staticUrls": "\n".join(urls),
                "includeContentsDb": False,
                "contentsDbExpression": 'PostgresDb(db_url="postgresql://ai:ai@localhost:5532/ai")',
                "knowledgeExpression": knowledge_expression,
            },
        ),
    )


def _skills_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
    path: str,
    validate: bool = True,
) -> GraphNode:
    skills_expression = f'Skills(loaders=[LocalSkills(path="{path}", validate={str(validate)})])'
    return GraphNode(
        id=node_id,
        type="skills",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            extras={
                "skillsPath": path,
                "skillsValidate": validate,
                "skillsExpression": skills_expression,
            },
        ),
    )


def _learning_machine_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
    namespace: str,
    provider: str = "openai",
    model: str = "gpt-4.1-mini",
) -> GraphNode:
    learning_expression = (
        f'LearningMachine(namespace="{namespace}", user_profile=True, user_memory=True, session_context=True, '
        "learned_knowledge=True, decision_log=True)"
    )
    return GraphNode(
        id=node_id,
        type="learning_machine",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            provider=provider,
            model=model,
            extras={
                "providerConfig": build_provider_config(provider),
                "useLearningModel": False,
                "learningNamespace": namespace,
                "learningDebugMode": False,
                "learningUserProfile": True,
                "learningUserMemory": True,
                "learningSessionContext": True,
                "learningEntityMemory": False,
                "learningLearnedKnowledge": True,
                "learningDecisionLog": True,
                "learningMachineExpression": learning_expression,
            },
        ),
    )


def _memory_manager_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
) -> GraphNode:
    return GraphNode(
        id=node_id,
        type="memory_manager",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            provider="openai",
            model="gpt-4.1-mini",
            extras={
                "useManagerModel": False,
                "providerConfig": build_provider_config("openai"),
                "systemMessage": "",
                "memoryCaptureInstructions": "Capture user preferences, recurring goals, and durable project context.",
                "additionalInstructions": "Prefer concise, high-signal memories that help future conversations.",
                "debugMode": False,
                "managerExpression": (
                    'MemoryManager(memory_capture_instructions="Capture user preferences, recurring goals, and durable '
                    'project context.", additional_instructions="Prefer concise, high-signal memories that help future '
                    'conversations.")'
                ),
            },
        ),
    )


def _session_summary_manager_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
) -> GraphNode:
    return GraphNode(
        id=node_id,
        type="session_summary_manager",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            provider="openai",
            model="gpt-4.1-mini",
            extras={
                "useManagerModel": False,
                "providerConfig": build_provider_config("openai"),
                "sessionSummaryPrompt": "Summarize the session focusing on resolved issues, next actions, and open questions.",
                "summaryRequestMessage": "Provide the summary of the conversation.",
                "managerExpression": (
                    'SessionSummaryManager(summary_request_message="Provide the summary of the conversation.", '
                    'session_summary_prompt="Summarize the session focusing on resolved issues, next actions, and open questions.")'
                ),
            },
        ),
    )


def _compression_manager_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
) -> GraphNode:
    return GraphNode(
        id=node_id,
        type="compression_manager",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            provider="openai",
            model="gpt-4.1-mini",
            extras={
                "useManagerModel": False,
                "providerConfig": build_provider_config("openai"),
                "compressToolResults": True,
                "compressToolResultsLimit": "3",
                "compressTokenLimit": "1200",
                "compressToolCallInstructions": "Compress tool outputs aggressively while preserving exact facts and numbers.",
                "managerExpression": (
                    'CompressionManager(compress_tool_results_limit=3, compress_token_limit=1200, '
                    'compress_tool_call_instructions="Compress tool outputs aggressively while preserving exact facts and numbers.")'
                ),
            },
        ),
    )


def _tool_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
    tool_mode: str = "function",
    function_name: str = "search_tool",
    function_code: str | None = None,
    builtin_tool_key: str = "websearch",
    builtin_import_path: str = "agno.tools.websearch",
    builtin_class_name: str = "WebSearchTools",
    builtin_config: str = '{\n  "backend": "google"\n}',
    builtin_workflow_function: str = "",
    builtin_workflow_executor_args: str = "",
) -> GraphNode:
    resolved_function_code = (
        function_code
        or "def search_tool(value: str) -> str:\n    return f'Search stub: {value}'\n"
    )
    return GraphNode(
        id=node_id,
        type="tool",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            extras={
                "toolMode": tool_mode,
                "builtinToolKey": builtin_tool_key,
                "builtinImportPath": builtin_import_path,
                "builtinClassName": builtin_class_name,
                "builtinConfig": builtin_config,
                "builtinWorkflowFunction": builtin_workflow_function,
                "builtinWorkflowExecutorArgs": builtin_workflow_executor_args,
                "functionName": function_name,
                "functionCode": resolved_function_code,
            },
        ),
    )


def _agent_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    instructions: str,
    description: str,
    provider: str = "openai",
    model: str = "gpt-4.1-mini",
    agent_config: dict[str, object] | None = None,
) -> GraphNode:
    resolved_agent_config = {
        "markdown": True,
        "add_datetime_to_context": True,
        "debug_mode": True,
        **(agent_config or {}),
    }
    return GraphNode(
        id=node_id,
        type="agent",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            instructions=instructions,
            provider=provider,
            model=model,
            extras={
                "providerConfig": build_provider_config(provider),
                "agentConfig": resolved_agent_config,
            },
        ),
    )


def _team_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    instructions: str,
    description: str,
    mode: str = "coordinate",
) -> GraphNode:
    return GraphNode(
        id=node_id,
        type="team",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            instructions=instructions,
            provider="openai",
            model="gpt-4.1-mini",
            extras={
                "providerConfig": build_provider_config("openai"),
                "teamConfig": {
                    "mode": mode,
                    "markdown": True,
                    "respond_directly": True,
                    "add_datetime_to_context": True,
                    "debug_mode": True,
                },
            },
        ),
    )


def _interface_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
    preset: str = "whatsapp",
    target_type: str = "agent",
) -> GraphNode:
    normalized_preset = (preset or "whatsapp").strip().lower()
    normalized_target_type = "team" if (target_type or "agent").strip().lower() == "team" else "agent"
    target_ref = f"<{normalized_target_type}>"
    list_target_ref = "[<team>]" if normalized_target_type == "team" else "[<agent>]"

    if normalized_preset == "telegram":
        interface_expression = (
            f'Telegram({normalized_target_type}={target_ref}, token=os.getenv("TELEGRAM_BOT_TOKEN"))'
        )
    elif normalized_preset == "slack":
        interface_expression = (
            f'Slack({normalized_target_type}={target_ref}, token=os.getenv("SLACK_BOT_TOKEN"), '
            'signing_secret=os.getenv("SLACK_SIGNING_SECRET"))'
        )
    elif normalized_preset == "a2a":
        interface_expression = f'A2A({"teams" if normalized_target_type == "team" else "agents"}={list_target_ref})'
    elif normalized_preset == "ag_ui":
        interface_expression = f"AGUI({normalized_target_type}={target_ref})"
    elif normalized_preset == "all":
        interface_expression = "\n".join(
            [
                f'Whatsapp({normalized_target_type}={target_ref}, phone_number_id=os.getenv("WHATSAPP_PHONE_NUMBER_ID"), access_token=os.getenv("WHATSAPP_ACCESS_TOKEN"), verify_token=os.getenv("WHATSAPP_VERIFY_TOKEN"))',
                f'Telegram({normalized_target_type}={target_ref}, token=os.getenv("TELEGRAM_BOT_TOKEN"))',
                f'Slack({normalized_target_type}={target_ref}, token=os.getenv("SLACK_BOT_TOKEN"), signing_secret=os.getenv("SLACK_SIGNING_SECRET"))',
                f'A2A({"teams" if normalized_target_type == "team" else "agents"}={list_target_ref})',
                f"AGUI({normalized_target_type}={target_ref})",
            ]
        )
    else:
        normalized_preset = "whatsapp"
        interface_expression = (
            f'Whatsapp({normalized_target_type}={target_ref}, phone_number_id=os.getenv("WHATSAPP_PHONE_NUMBER_ID"), '
            'access_token=os.getenv("WHATSAPP_ACCESS_TOKEN"), verify_token=os.getenv("WHATSAPP_VERIFY_TOKEN"))'
        )

    return GraphNode(
        id=node_id,
        type="interface",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            extras={
                "interfacePreset": normalized_preset,
                "interfaceTargetType": normalized_target_type,
                "interfaceExpression": interface_expression,
            },
        ),
    )


def _workflow_step_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
    order: int,
) -> GraphNode:
    return GraphNode(
        id=node_id,
        type="workflow_step",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            extras={
                "stepOrder": order,
                "maxRetries": 3,
                "skipOnFailure": False,
                "strictInputValidation": False,
                "requiresConfirmation": False,
                "confirmationMessage": "",
                "onReject": "skip",
                "requiresUserInput": False,
                "userInputMessage": "",
                "userInputSchema": "",
                "onError": "skip",
            },
        ),
    )


def _workflow_node(
    node_id: str,
    *,
    x: float,
    y: float,
    name: str,
    description: str,
) -> GraphNode:
    return GraphNode(
        id=node_id,
        type="workflow",
        position=Position(x=x, y=y),
        data=NodeData(
            name=name,
            description=description,
            extras={
                "workflowConfig": {
                    "debug_mode": True,
                    "stream_events": True,
                    "stream_executor_events": True,
                    "store_executor_outputs": True,
                    "telemetry": True,
                    "num_history_runs": 3,
                    "cache_session": False,
                    "add_workflow_history_to_steps": False,
                }
            },
        ),
    )


def _output_node(node_id: str, *, x: float, y: float, name: str) -> GraphNode:
    return GraphNode(
        id=node_id,
        type="output",
        position=Position(x=x, y=y),
        data=NodeData(name=name, output_format="text"),
    )


CANVAS_TEMPLATES: list[CanvasTemplateSummary] = [
    CanvasTemplateSummary(
        id="base-agent",
        name="Base Template",
        description="Starts with Input, Tool, Agent, and Output for a fast first run.",
        category="base",
        default_flow_name="support_agent_flow",
    ),
    CanvasTemplateSummary(
        id="team-support-desk",
        name="Team Support Desk",
        description="Two specialists feed a Team node that consolidates a single customer-ready answer.",
        category="team",
        default_flow_name="team_support_desk",
    ),
    CanvasTemplateSummary(
        id="workflow-team-handoff",
        name="Workflow Team Handoff",
        description="A sequential Workflow moves from discovery into a Team-based review and final delivery.",
        category="workflow",
        default_flow_name="workflow_team_handoff",
    ),
    CanvasTemplateSummary(
        id="memory-support-agent",
        name="Memory Support Agent",
        description="Shows Database, Memory Manager, Session Summary, and Compression working together on one Agent.",
        category="memory",
        default_flow_name="memory_support_agent",
    ),
    CanvasTemplateSummary(
        id="rag-document-assistant",
        name="RAG Document Assistant",
        description="A local-first document RAG starter using LanceDB + Knowledge with attached files.",
        category="rag",
        default_flow_name="rag_document_assistant",
    ),
    CanvasTemplateSummary(
        id="learning-rag-assistant",
        name="Learning RAG Assistant",
        description="Combines Database, Knowledge, and Learning Machine so the Agent can retrieve and remember.",
        category="learning",
        default_flow_name="learning_rag_assistant",
    ),
    CanvasTemplateSummary(
        id="workflow-tool-agent",
        name="Workflow Tool + Agent",
        description="Shows a sequential workflow step powered by a Function Tool before handing off to an Agent.",
        category="workflow",
        default_flow_name="workflow_tool_agent",
    ),
    CanvasTemplateSummary(
        id="workflow-builtin-tool-agent",
        name="Workflow Built-in Tool + Agent",
        description="Shows a sequential workflow step powered by a Built-in Tool function before handing off to an Agent.",
        category="workflow",
        default_flow_name="workflow_builtin_tool_agent",
    ),
    CanvasTemplateSummary(
        id="skill-enabled-agent",
        name="Skill Enabled Agent",
        description="Connects a local Agno Skill pack into an Agent and demonstrates loading the skill before answering a support task.",
        category="skills",
        default_flow_name="skill_enabled_agent",
    ),
    CanvasTemplateSummary(
        id="whatsapp-interface-agent",
        name="WhatsApp Interface Agent",
        description="Connects a WhatsApp interface node to an Agent so you can scaffold AgentOS webhook deployment from the canvas.",
        category="interfaces",
        default_flow_name="whatsapp_interface_agent",
    ),
    CanvasTemplateSummary(
        id="workflow-hitl-review",
        name="Workflow HITL Review",
        description="Sequential workflow template demonstrating Step-level confirmation, user input schema, and pause-on-error controls.",
        category="workflow",
        default_flow_name="workflow_hitl_review",
    ),
    CanvasTemplateSummary(
        id="whatsapp-interface-custom-env",
        name="WhatsApp Interface Custom Envs",
        description="Shows a WhatsApp Interface node using custom environment variable property names for runtime secrets.",
        category="interfaces",
        default_flow_name="whatsapp_interface_custom_env",
    ),
]


def list_canvas_templates() -> list[CanvasTemplateSummary]:
    return CANVAS_TEMPLATES


def get_canvas_template(template_id: str) -> CanvasGraph | None:
    normalized_template_id = template_id.strip().lower()
    if normalized_template_id == "base-agent":
        return build_base_graph()
    if normalized_template_id == "team-support-desk":
        return build_team_graph()
    if normalized_template_id == "workflow-team-handoff":
        return build_workflow_graph()
    if normalized_template_id == "memory-support-agent":
        return build_memory_agent_graph()
    if normalized_template_id == "rag-document-assistant":
        return build_rag_graph()
    if normalized_template_id == "learning-rag-assistant":
        return build_learning_rag_graph()
    if normalized_template_id == "workflow-tool-agent":
        return build_workflow_tool_agent_graph()
    if normalized_template_id == "workflow-builtin-tool-agent":
        return build_workflow_builtin_tool_agent_graph()
    if normalized_template_id == "skill-enabled-agent":
        return build_skill_enabled_agent_graph()
    if normalized_template_id == "whatsapp-interface-agent":
        return build_whatsapp_interface_agent_graph()
    if normalized_template_id == "workflow-hitl-review":
        return build_workflow_hitl_review_graph()
    if normalized_template_id == "whatsapp-interface-custom-env":
        return build_whatsapp_interface_custom_env_graph()
    return None


def build_sample_graph() -> CanvasGraph:
    return build_base_graph()


def build_base_graph() -> CanvasGraph:
    return CanvasGraph(
        project=ProjectMeta(name="Support Agent Flow"),
        nodes=[
            _input_node(
                "input_1",
                x=260,
                y=250,
                name="User Input",
                text="Pesquise formas práticas de usar agents em automação.",
                source="sample_graph",
            ),
            _tool_node(
                "tool_1",
                x=260,
                y=430,
                name="Search Tool",
                description="Busca web para enriquecer a resposta do agente.",
            ),
            _agent_node(
                "agent_1",
                x=560,
                y=250,
                name="Search Agent",
                description="Agente base para pesquisas rápidas.",
                instructions="Responda de forma objetiva e com foco em automação com agents.",
            ),
            _output_node("output_1", x=860, y=250, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_tool_agent", source="tool_1", target="agent_1"),
            GraphEdge(id="edge_input_agent", source="input_1", target="agent_1"),
            GraphEdge(id="edge_agent_output", source="agent_1", target="output_1"),
        ],
    )


def build_team_graph() -> CanvasGraph:
    return CanvasGraph(
        project=ProjectMeta(name="Team Support Desk"),
        nodes=[
            _input_node(
                "input_1",
                x=180,
                y=260,
                name="Customer Request",
                text="Monte uma resposta para um cliente que quer usar Agno Teams em suporte e onboarding.",
                source="team_support_desk",
            ),
            _tool_node(
                "tool_1",
                x=180,
                y=480,
                name="Web Search",
                description="Busca referências externas quando a equipe precisar complementar a resposta.",
            ),
            _agent_node(
                "agent_1",
                x=520,
                y=120,
                name="Support Researcher",
                description="Levanta contexto e casos de uso aplicáveis.",
                instructions="Pesquise rapidamente boas práticas e pontos de atenção para operações de suporte com Agno.",
            ),
            _agent_node(
                "agent_2",
                x=520,
                y=380,
                name="Onboarding Planner",
                description="Transforma pesquisa em um plano acionável.",
                instructions="Organize a resposta em passos claros de onboarding e adoção para o time do cliente.",
            ),
            _team_node(
                "team_1",
                x=860,
                y=250,
                name="Support Strategy Team",
                description="Time que consolida pesquisa e plano operacional em uma resposta final.",
                instructions="Coordene os especialistas, resolva conflitos e entregue uma resposta única, clara e pronta para o cliente.",
            ),
            _output_node("output_1", x=1160, y=250, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_input_team", source="input_1", target="team_1"),
            GraphEdge(id="edge_tool_team", source="tool_1", target="team_1"),
            GraphEdge(id="edge_agent1_team", source="agent_1", target="team_1"),
            GraphEdge(id="edge_agent2_team", source="agent_2", target="team_1"),
            GraphEdge(id="edge_team_output", source="team_1", target="output_1"),
        ],
    )


def build_workflow_graph() -> CanvasGraph:
    return CanvasGraph(
        project=ProjectMeta(name="Workflow Team Handoff"),
        nodes=[
            _input_node(
                "input_1",
                x=140,
                y=280,
                name="Flow Input",
                text="Crie uma proposta em duas etapas: descoberta do problema e resposta final coordenada por time.",
                source="workflow_team_handoff",
            ),
            _tool_node(
                "tool_1",
                x=420,
                y=560,
                name="Web Search",
                description="Ferramenta opcional para enriquecer a etapa de revisão do time.",
            ),
            _agent_node(
                "agent_1",
                x=430,
                y=120,
                name="Discovery Agent",
                description="Faz a primeira passada e organiza os fatos principais.",
                instructions="Analise a solicitação, identifique objetivos, riscos e fatos que precisam ser confirmados antes da resposta final.",
            ),
            _agent_node(
                "agent_2",
                x=430,
                y=340,
                name="Reviewer Agent",
                description="Questiona lacunas e melhora a qualidade da saída.",
                instructions="Revise o material produzido na etapa anterior, aponte lacunas e proponha correções importantes.",
            ),
            _agent_node(
                "agent_3",
                x=430,
                y=560,
                name="Writer Agent",
                description="Transforma revisão em resposta clara para o usuário.",
                instructions="Escreva a resposta final com clareza, estrutura e foco na ação recomendada.",
            ),
            _workflow_step_node(
                "workflow_step_1",
                x=760,
                y=120,
                name="Discovery Step",
                description="Primeira etapa do workflow com análise inicial.",
                order=1,
            ),
            _team_node(
                "team_1",
                x=760,
                y=450,
                name="Editorial Team",
                description="Time que revisa a descoberta e fecha a resposta final.",
                instructions="Use a descoberta inicial como contexto, faça revisão crítica e entregue a melhor resposta final para o usuário.",
                mode="coordinate",
            ),
            _workflow_step_node(
                "workflow_step_2",
                x=1080,
                y=450,
                name="Editorial Step",
                description="Etapa de consolidação final com time coordenado.",
                order=2,
            ),
            _workflow_node(
                "workflow_1",
                x=1390,
                y=280,
                name="Response Workflow",
                description="Workflow sequencial com handoff entre agente e time.",
            ),
            _output_node("output_1", x=1700, y=280, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_tool_team", source="tool_1", target="team_1"),
            GraphEdge(id="edge_agent1_step", source="agent_1", target="workflow_step_1"),
            GraphEdge(id="edge_agent2_team", source="agent_2", target="team_1"),
            GraphEdge(id="edge_agent3_team", source="agent_3", target="team_1"),
            GraphEdge(id="edge_team_step", source="team_1", target="workflow_step_2"),
            GraphEdge(id="edge_input_workflow", source="input_1", target="workflow_1"),
            GraphEdge(id="edge_step1_workflow", source="workflow_step_1", target="workflow_1"),
            GraphEdge(id="edge_step2_workflow", source="workflow_step_2", target="workflow_1"),
            GraphEdge(id="edge_workflow_output", source="workflow_1", target="output_1"),
        ],
    )


def build_memory_agent_graph() -> CanvasGraph:
    return CanvasGraph(
        project=ProjectMeta(name="Memory Support Agent"),
        nodes=[
            _input_node(
                "input_1",
                x=160,
                y=260,
                name="Customer Input",
                text="Responda como um agente de suporte que aprende preferências do usuário entre sessões.",
                source="memory_support_agent",
            ),
            _database_node(
                "database_1",
                x=160,
                y=500,
                name="Session DB",
                description="Banco local para sessões, memórias e estado durável.",
                db_name="memory_support",
            ),
            _memory_manager_node(
                "memory_manager_1",
                x=500,
                y=120,
                name="Memory Manager",
                description="Captura preferências e fatos duráveis do usuário.",
            ),
            _session_summary_manager_node(
                "session_summary_manager_1",
                x=500,
                y=300,
                name="Session Summary Manager",
                description="Resume conversas longas para manter continuidade.",
            ),
            _compression_manager_node(
                "compression_manager_1",
                x=500,
                y=480,
                name="Compression Manager",
                description="Compacta resultados de ferramentas para economizar contexto.",
            ),
            _agent_node(
                "agent_1",
                x=860,
                y=260,
                name="Memory Support Agent",
                description="Agente configurado para memória persistente e continuidade entre sessões.",
                instructions="Atenda o usuário com contexto acumulado, preserve preferências importantes e mantenha a resposta objetiva.",
                agent_config={
                    "user_id": "demo_customer",
                    "session_id": "memory_support_demo",
                    "enable_agentic_memory": True,
                    "update_memory_on_run": True,
                    "add_memories_to_context": True,
                    "enable_session_summaries": True,
                    "add_session_summary_to_context": True,
                    "compress_tool_results": True,
                },
            ),
            _output_node("output_1", x=1170, y=260, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_input_agent", source="input_1", target="agent_1"),
            GraphEdge(id="edge_db_memory_manager", source="database_1", target="memory_manager_1"),
            GraphEdge(id="edge_db_agent", source="database_1", target="agent_1"),
            GraphEdge(id="edge_memory_manager_agent", source="memory_manager_1", target="agent_1"),
            GraphEdge(id="edge_summary_manager_agent", source="session_summary_manager_1", target="agent_1"),
            GraphEdge(id="edge_compression_manager_agent", source="compression_manager_1", target="agent_1"),
            GraphEdge(id="edge_agent_output", source="agent_1", target="output_1"),
        ],
    )


def build_rag_graph() -> CanvasGraph:
    vector_expression = 'LanceDb(uri="tmp/rag_knowledge", table_name="documents")'
    return CanvasGraph(
        project=ProjectMeta(name="RAG Document Assistant"),
        nodes=[
            _input_node(
                "input_1",
                x=140,
                y=250,
                name="Document Input",
                text="Anexe um PDF, DOCX, CSV ou TXT e pergunte algo específico sobre o conteúdo.",
                source="rag_document_assistant",
                input_mode="mixed",
            ),
            _vector_db_node(
                "vector_db_1",
                x=450,
                y=430,
                name="LanceDB Store",
                description="Vector store local para indexação dos documentos enviados no flow.",
                uri="tmp/rag_knowledge",
            ),
            _knowledge_node(
                "knowledge_1",
                x=770,
                y=430,
                name="Document Knowledge",
                description="Knowledge configurado para ingerir anexos e responder via RAG.",
                vector_expression=vector_expression,
                max_results=8,
                reader="auto",
                ingest_attached_files=True,
                ingest_input_text=False,
                static_text="Use o documento anexado como fonte prioritária e cite quando a resposta vier do arquivo.",
            ),
            _agent_node(
                "agent_1",
                x=770,
                y=220,
                name="RAG Assistant",
                description="Agente preparado para responder com base nos documentos recebidos no input.",
                instructions="Responda usando primeiro o conhecimento indexado dos documentos anexados. Seja claro sobre quando a resposta veio do material enviado.",
                agent_config={
                    "add_knowledge_to_context": True,
                    "search_knowledge": True,
                    "references_format": "json",
                },
            ),
            _output_node("output_1", x=1080, y=220, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_input_agent", source="input_1", target="agent_1"),
            GraphEdge(id="edge_vector_knowledge", source="vector_db_1", target="knowledge_1"),
            GraphEdge(id="edge_knowledge_agent", source="knowledge_1", target="agent_1"),
            GraphEdge(id="edge_agent_output", source="agent_1", target="output_1"),
        ],
    )


def build_learning_rag_graph() -> CanvasGraph:
    vector_expression = 'LanceDb(uri="tmp/learning_rag_knowledge", table_name="documents")'
    return CanvasGraph(
        project=ProjectMeta(name="Learning RAG Assistant"),
        nodes=[
            _input_node(
                "input_1",
                x=120,
                y=260,
                name="User Input",
                text="Anexe material de referência e peça uma resposta que também considere preferências aprendidas do usuário.",
                source="learning_rag_assistant",
                input_mode="mixed",
            ),
            _database_node(
                "database_1",
                x=430,
                y=540,
                name="Learning DB",
                description="Banco local para perfis, memória e histórico da learning machine.",
                db_name="learning_rag",
            ),
            _vector_db_node(
                "vector_db_1",
                x=430,
                y=360,
                name="Knowledge Store",
                description="Vector store local para a base de conhecimento anexada ao flow.",
                uri="tmp/learning_rag_knowledge",
            ),
            _knowledge_node(
                "knowledge_1",
                x=760,
                y=360,
                name="Learning Knowledge",
                description="Knowledge que indexa anexos e texto estático para dar base factual ao agente.",
                vector_expression=vector_expression,
                max_results=10,
                reader="auto",
                ingest_attached_files=True,
                ingest_input_text=True,
                static_text=(
                    "Este fluxo deve combinar contexto factual do material enviado com o histórico aprendido do usuário."
                ),
            ),
            _learning_machine_node(
                "learning_machine_1",
                x=760,
                y=560,
                name="Customer Learning Machine",
                description="Learning machine compartilhada para perfis, memórias e conhecimento aprendido.",
                namespace="customer_success",
            ),
            _agent_node(
                "agent_1",
                x=1070,
                y=260,
                name="Learning RAG Agent",
                description="Agente que recupera conhecimento e injeta aprendizados relevantes antes de responder.",
                instructions="Responda combinando fatos do conhecimento recuperado com aprendizados persistentes do usuário. Quando houver conflito, priorize os fatos atuais do material fornecido.",
                agent_config={
                    "user_id": "demo_customer",
                    "session_id": "learning_rag_demo",
                    "add_knowledge_to_context": True,
                    "search_knowledge": True,
                    "add_learnings_to_context": True,
                    "references_format": "json",
                },
            ),
            _output_node("output_1", x=1380, y=260, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_input_agent", source="input_1", target="agent_1"),
            GraphEdge(id="edge_db_agent", source="database_1", target="agent_1"),
            GraphEdge(id="edge_db_learning", source="database_1", target="learning_machine_1"),
            GraphEdge(id="edge_vector_knowledge", source="vector_db_1", target="knowledge_1"),
            GraphEdge(id="edge_knowledge_learning", source="knowledge_1", target="learning_machine_1"),
            GraphEdge(id="edge_knowledge_agent", source="knowledge_1", target="agent_1"),
            GraphEdge(id="edge_learning_agent", source="learning_machine_1", target="agent_1"),
            GraphEdge(id="edge_agent_output", source="agent_1", target="output_1"),
        ],
    )


def build_workflow_tool_agent_graph() -> CanvasGraph:
    return CanvasGraph(
        project=ProjectMeta(name="Workflow Tool + Agent"),
        nodes=[
            _input_node(
                "input_1",
                x=120,
                y=250,
                name="Workflow Input",
                text="Monte um resumo de projeto: primeiro normalize os fatos com uma função e depois entregue uma resposta final pelo agente.",
                source="workflow_tool_agent",
            ),
            _tool_node(
                "tool_1",
                x=450,
                y=120,
                name="Normalize Brief",
                description="Function Tool que prepara um briefing estruturado para a próxima etapa do workflow.",
                function_name="normalize_brief",
                function_code=(
                    "def normalize_brief(value: str) -> str:\n"
                    "    cleaned = value.strip()\n"
                    "    return f\"Normalized brief:\\n- source: workflow\\n- request: {cleaned}\"\n"
                ),
            ),
            _workflow_step_node(
                "workflow_step_1",
                x=760,
                y=120,
                name="Normalize Step",
                description="Executa a função de normalização antes da resposta final.",
                order=1,
            ),
            _agent_node(
                "agent_1",
                x=450,
                y=380,
                name="Delivery Agent",
                description="Recebe o resultado estruturado da etapa anterior e produz a resposta final.",
                instructions="Use o output das etapas anteriores para responder com clareza, concisão e uma recomendação final objetiva.",
            ),
            _workflow_step_node(
                "workflow_step_2",
                x=760,
                y=380,
                name="Delivery Step",
                description="Transforma o briefing normalizado em resposta final.",
                order=2,
            ),
            _workflow_node(
                "workflow_1",
                x=1080,
                y=250,
                name="Tool Agent Workflow",
                description="Workflow sequencial com Function Tool seguido por Agent.",
            ),
            _output_node("output_1", x=1390, y=250, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_tool_step", source="tool_1", target="workflow_step_1"),
            GraphEdge(id="edge_agent_step", source="agent_1", target="workflow_step_2"),
            GraphEdge(id="edge_input_workflow", source="input_1", target="workflow_1"),
            GraphEdge(id="edge_step1_workflow", source="workflow_step_1", target="workflow_1"),
            GraphEdge(id="edge_step2_workflow", source="workflow_step_2", target="workflow_1"),
            GraphEdge(id="edge_workflow_output", source="workflow_1", target="output_1"),
        ],
    )


def build_workflow_builtin_tool_agent_graph() -> CanvasGraph:
    return CanvasGraph(
        project=ProjectMeta(name="Workflow Built-in Tool + Agent"),
        nodes=[
            _input_node(
                "input_1",
                x=120,
                y=250,
                name="Workflow Input",
                text="Pesquise as principais novidades do Agno e entregue um resumo executivo em portugues.",
                source="workflow_builtin_tool_agent",
            ),
            _tool_node(
                "tool_1",
                x=450,
                y=120,
                name="Web Research Toolkit",
                description="Built-in Tool que usa WebSearchTools para pesquisar antes do handoff para o Agent.",
                tool_mode="builtin",
                builtin_tool_key="websearch",
                builtin_import_path="agno.tools.websearch",
                builtin_class_name="WebSearchTools",
                builtin_config='{\n  "backend": "google"\n}',
                builtin_workflow_function="web_search",
                builtin_workflow_executor_args='{\n  "max_results": 3\n}',
            ),
            _workflow_step_node(
                "workflow_step_1",
                x=760,
                y=120,
                name="Research Step",
                description="Executa a busca web via Built-in Tool antes da resposta final.",
                order=1,
            ),
            _agent_node(
                "agent_1",
                x=450,
                y=380,
                name="Research Synthesizer",
                description="Resume os resultados do toolkit em uma resposta final clara.",
                instructions="Use os outputs das etapas anteriores para responder com um resumo executivo, destacando os pontos principais e qualquer incerteza.",
            ),
            _workflow_step_node(
                "workflow_step_2",
                x=760,
                y=380,
                name="Summary Step",
                description="Transforma os resultados da busca em resposta final.",
                order=2,
            ),
            _workflow_node(
                "workflow_1",
                x=1080,
                y=250,
                name="Built-in Tool Workflow",
                description="Workflow sequencial com Built-in Tool seguido por Agent.",
            ),
            _output_node("output_1", x=1390, y=250, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_builtin_tool_step", source="tool_1", target="workflow_step_1"),
            GraphEdge(id="edge_agent_step_builtin", source="agent_1", target="workflow_step_2"),
            GraphEdge(id="edge_input_workflow_builtin", source="input_1", target="workflow_1"),
            GraphEdge(id="edge_step1_workflow_builtin", source="workflow_step_1", target="workflow_1"),
            GraphEdge(id="edge_step2_workflow_builtin", source="workflow_step_2", target="workflow_1"),
            GraphEdge(id="edge_workflow_output_builtin", source="workflow_1", target="output_1"),
        ],
    )


def build_skill_enabled_agent_graph() -> CanvasGraph:
    return CanvasGraph(
        project=ProjectMeta(name="Skill Enabled Agent"),
        nodes=[
            _input_node(
                "input_1",
                x=140,
                y=250,
                name="Skill Input",
                text="Use o skill conectado para responder este ticket: 'Nao consigo redefinir minha senha e preciso acessar minha conta ainda hoje.'",
                source="skill_enabled_agent",
            ),
            _skills_node(
                "skills_1",
                x=450,
                y=430,
                name="Support Style Skills",
                description="Pacote local de skills com padrão de resposta para suporte e handoff.",
                path=EXAMPLE_SKILL_PATH,
                validate=True,
            ),
            _agent_node(
                "agent_1",
                x=770,
                y=250,
                name="Skill Guided Agent",
                description="Agent conectado a um skill pack local para aplicar um padrão de resposta reutilizável.",
                instructions="Quando houver um skill conectado relevante, carregue as instrucoes dele antes de responder e siga esse workflow com clareza e objetividade.",
            ),
            _output_node("output_1", x=1080, y=250, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_input_agent", source="input_1", target="agent_1"),
            GraphEdge(id="edge_skills_agent", source="skills_1", target="agent_1"),
            GraphEdge(id="edge_agent_output", source="agent_1", target="output_1"),
        ],
    )


def build_whatsapp_interface_agent_graph() -> CanvasGraph:
    return CanvasGraph(
        project=ProjectMeta(name="WhatsApp Interface Agent"),
        nodes=[
            _input_node(
                "input_1",
                x=140,
                y=260,
                name="User Input",
                text="Crie uma resposta de boas-vindas para um novo usuário no canal de WhatsApp.",
                source="whatsapp_interface_agent",
            ),
            _agent_node(
                "agent_1",
                x=460,
                y=260,
                name="WhatsApp Support Agent",
                description="Agente base para atendimento assíncrono no WhatsApp.",
                instructions="Responda com clareza e objetividade, priorizando mensagens curtas e acionáveis para conversas no WhatsApp.",
            ),
            _interface_node(
                "interface_1",
                x=800,
                y=420,
                name="WhatsApp Interface",
                description="Interface AgentOS para webhook do WhatsApp Cloud API.",
                preset="whatsapp",
                target_type="agent",
            ),
            _output_node("output_1", x=800, y=260, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_input_agent", source="input_1", target="agent_1"),
            GraphEdge(id="edge_agent_interface", source="agent_1", target="interface_1"),
            GraphEdge(id="edge_agent_output", source="agent_1", target="output_1"),
        ],
    )


def build_workflow_hitl_review_graph() -> CanvasGraph:
    hitl_metadata = (
        '{\n'
        '  "source": "workflow_hitl_review",\n'
        '  "hitl_auto_max_rounds": 5\n'
        '}'
    )

    input_node = _input_node(
        "input_1",
        x=140,
        y=280,
        name="Review Request",
        text="Prepare a customer-facing response that must pass a human review gate before final delivery.",
        source="workflow_hitl_review",
    )
    input_extras = dict(input_node.data.extras or {})
    input_extras["payloadJson"] = hitl_metadata
    input_extras["hitlAutoApprove"] = "true"
    input_extras["hitlUserInputJson"] = (
        '{\n'
        '  "ticket_id": "HITL-DEMO-001",\n'
        '  "review_note": "auto-approved in preview"\n'
        '}'
    )
    input_node.data.extras = input_extras

    step_1 = _workflow_step_node(
        "workflow_step_1",
        x=760,
        y=130,
        name="Draft Review Gate",
        description="Requires human confirmation before proceeding with the reviewed draft.",
        order=1,
    )
    step_1_extras = dict(step_1.data.extras or {})
    step_1_extras.update(
        {
            "requiresConfirmation": True,
            "confirmationMessage": "Review the draft summary and confirm if it can proceed to final response.",
            "onReject": "cancel",
            "onError": "pause",
        }
    )
    step_1.data.extras = step_1_extras

    step_2 = _workflow_step_node(
        "workflow_step_2",
        x=1080,
        y=410,
        name="Compliance Input Gate",
        description="Requests required user metadata before completing the workflow.",
        order=2,
    )
    step_2_extras = dict(step_2.data.extras or {})
    step_2_extras.update(
        {
            "requiresUserInput": True,
            "userInputMessage": "Provide the compliance ticket id before sending the final response.",
            "userInputSchema": (
                '[{"name": "ticket_id", "type": "string", "required": true}, '
                '{"name": "review_note", "type": "string", "required": false}]'
            ),
            "onError": "pause",
        }
    )
    step_2.data.extras = step_2_extras

    return CanvasGraph(
        project=ProjectMeta(name="Workflow HITL Review"),
        nodes=[
            input_node,
            _agent_node(
                "agent_1",
                x=420,
                y=130,
                name="Draft Agent",
                description="Creates the first draft for human confirmation.",
                instructions="Create a concise draft response highlighting assumptions and risk points.",
            ),
            _agent_node(
                "agent_2",
                x=420,
                y=410,
                name="Final Response Agent",
                description="Produces the final response after required confirmation and user inputs.",
                instructions="Incorporate reviewer confirmation and ticket metadata before finalizing the answer.",
            ),
            step_1,
            step_2,
            _workflow_node(
                "workflow_1",
                x=1400,
                y=280,
                name="HITL Review Workflow",
                description="Sequential workflow with confirmation and user-input gates on steps.",
            ),
            _output_node("output_1", x=1700, y=280, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_agent1_step1", source="agent_1", target="workflow_step_1"),
            GraphEdge(id="edge_agent2_step2", source="agent_2", target="workflow_step_2"),
            GraphEdge(id="edge_input_workflow", source="input_1", target="workflow_1"),
            GraphEdge(id="edge_step1_workflow", source="workflow_step_1", target="workflow_1"),
            GraphEdge(id="edge_step2_workflow", source="workflow_step_2", target="workflow_1"),
            GraphEdge(id="edge_workflow_output", source="workflow_1", target="output_1"),
        ],
    )


def build_whatsapp_interface_custom_env_graph() -> CanvasGraph:
    interface_node = _interface_node(
        "interface_1",
        x=800,
        y=420,
        name="WhatsApp Interface (Custom Envs)",
        description="WhatsApp interface with custom env variable names configured in node extras.",
        preset="whatsapp",
        target_type="agent",
    )
    interface_extras = dict(interface_node.data.extras or {})
    interface_extras.update(
        {
            "whatsappPhoneNumberIdEnv": "MY_WA_PHONE_ID",
            "whatsappAccessTokenEnv": "MY_WA_ACCESS_TOKEN",
            "whatsappVerifyTokenEnv": "MY_WA_VERIFY_TOKEN",
            "interfaceExpression": (
                'Whatsapp(agent=<agent>, phone_number_id=os.getenv("MY_WA_PHONE_ID"), '
                'access_token=os.getenv("MY_WA_ACCESS_TOKEN"), verify_token=os.getenv("MY_WA_VERIFY_TOKEN"))'
            ),
        }
    )
    interface_node.data.extras = interface_extras

    return CanvasGraph(
        project=ProjectMeta(name="WhatsApp Interface Custom Envs"),
        nodes=[
            _input_node(
                "input_1",
                x=140,
                y=260,
                name="User Input",
                text="Respond to this customer and show that interface secrets can use custom env variable names.",
                source="whatsapp_interface_custom_env",
            ),
            _agent_node(
                "agent_1",
                x=460,
                y=260,
                name="Interface Agent",
                description="Agent connected to a WhatsApp Interface node configured with custom env properties.",
                instructions="Reply clearly and keep responses short for chat channel delivery.",
            ),
            interface_node,
            _output_node("output_1", x=800, y=260, name="Console Output"),
        ],
        edges=[
            GraphEdge(id="edge_input_agent", source="input_1", target="agent_1"),
            GraphEdge(id="edge_agent_interface", source="agent_1", target="interface_1"),
            GraphEdge(id="edge_agent_output", source="agent_1", target="output_1"),
        ],
    )
