from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    INPUT = "input"
    RABBITMQ_INPUT = "rabbitmq_input"
    RABBITMQ_OUTPUT = "rabbitmq_output"
    KAFKA_INPUT = "kafka_input"
    KAFKA_OUTPUT = "kafka_output"
    REDIS_INPUT = "redis_input"
    REDIS_OUTPUT = "redis_output"
    NATS_INPUT = "nats_input"
    NATS_OUTPUT = "nats_output"
    SQS_INPUT = "sqs_input"
    SQS_OUTPUT = "sqs_output"
    PUBSUB_INPUT = "pubsub_input"
    PUBSUB_OUTPUT = "pubsub_output"
    AGENT = "agent"
    TEAM = "team"
    WORKFLOW = "workflow"
    WORKFLOW_STEP = "workflow_step"
    TOOL = "tool"
    SKILLS = "skills"
    INTERFACE = "interface"
    CONDITION = "condition"
    OUTPUT = "output"
    OUTPUT_API = "output_api"
    DATABASE = "database"
    VECTOR_DB = "vector_db"
    KNOWLEDGE = "knowledge"
    LEARNING_MACHINE = "learning_machine"
    MEMORY_MANAGER = "memory_manager"
    SESSION_SUMMARY_MANAGER = "session_summary_manager"
    COMPRESSION_MANAGER = "compression_manager"


class TargetRuntime(str, Enum):
    AGNO_PYTHON = "agno-python"
    AGNOGO = "agnogo"


class Position(BaseModel):
    x: float = 0
    y: float = 0


class NodeData(BaseModel):
    name: str
    description: str | None = None
    instructions: str | None = None
    provider: str | None = None
    model: str | None = None
    temperature: float | None = None
    tools: list[str] = Field(default_factory=list)
    prompt: str | None = None
    condition: str | None = None
    output_format: str | None = None
    extras: dict[str, Any] = Field(default_factory=dict)


class GraphNode(BaseModel):
    id: str
    type: NodeType
    position: Position = Field(default_factory=Position)
    data: NodeData


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None


class ProjectRuntimeEnvVar(BaseModel):
    key: str = ""
    value: str = ""


class ProjectRuntimeConfig(BaseModel):
    envVars: list[ProjectRuntimeEnvVar] = Field(default_factory=list)
    authEnabled: bool = False
    authToken: str | None = None


class ProjectMeta(BaseModel):
    name: str = "Untitled Agno Flow"
    target: TargetRuntime = TargetRuntime.AGNO_PYTHON
    runtime: ProjectRuntimeConfig = Field(default_factory=ProjectRuntimeConfig)


class CanvasGraph(BaseModel):
    project: ProjectMeta = Field(default_factory=ProjectMeta)
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


class CanvasTemplateSummary(BaseModel):
    id: str
    name: str
    description: str
    category: str
    default_flow_name: str


class ListCanvasTemplatesResponse(BaseModel):
    templates: list[CanvasTemplateSummary] = Field(default_factory=list)


class SkillPathOption(BaseModel):
    path: str
    label: str
    source: str
    validates: bool = True
    validation_error: str | None = None


class ListSkillPathsResponse(BaseModel):
    paths: list[SkillPathOption] = Field(default_factory=list)


class BuiltInToolFunctionOption(BaseModel):
    name: str
    label: str
    description: str | None = None
    signature: str = "()"
    required_params: list[str] = Field(default_factory=list)
    optional_params: list[str] = Field(default_factory=list)


class BuiltInToolFunctionsRequest(BaseModel):
    import_path: str
    class_name: str
    config: str | None = None


class ListBuiltInToolFunctionsResponse(BaseModel):
    functions: list[BuiltInToolFunctionOption] = Field(default_factory=list)
    error: str | None = None


class SaveFlowRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    graph: CanvasGraph


class SaveFlowResponse(BaseModel):
    name: str
    created_at: str
    updated_at: str


class FlowSummary(BaseModel):
    name: str
    updated_at: str


class EmailListenerStatus(BaseModel):
    flow_name: str
    node_id: str
    node_name: str
    protocol: str
    host: str
    mailbox: str
    poll_interval_seconds: int
    enabled: bool = True
    status: str = "idle"
    last_checked_at: str | None = None
    last_triggered_at: str | None = None
    last_processed_message_key: str | None = None
    last_error: str | None = None
    last_result: str | None = None


class ListEmailListenerStatusesResponse(BaseModel):
    listeners: list[EmailListenerStatus] = Field(default_factory=list)


class QueueSubscriberStatus(BaseModel):
    flow_name: str
    node_id: str
    node_name: str
    provider: str
    poll_interval_seconds: int
    enabled: bool = False
    connected: bool = False
    status: str = "idle"
    last_checked_at: str | None = None
    last_triggered_at: str | None = None
    last_message_id: str | None = None
    last_payload_received_at: str | None = None
    last_payload_preview: str | None = None
    last_error: str | None = None
    last_result: str | None = None


class ListQueueSubscriberStatusesResponse(BaseModel):
    subscribers: list[QueueSubscriberStatus] = Field(default_factory=list)


class FlowRuntimeStatus(BaseModel):
    flow_name: str
    active_runs: int = 0
    total_runs: int = 0
    success_runs: int = 0
    failed_runs: int = 0
    last_source: str | None = None
    last_started_at: str | None = None
    last_finished_at: str | None = None
    last_duration_ms: int | None = None
    last_error: str | None = None


class ListFlowRuntimeStatusesResponse(BaseModel):
    statuses: list[FlowRuntimeStatus] = Field(default_factory=list)


class WhatsappSessionStatus(BaseModel):
    flow_name: str
    node_id: str
    node_name: str
    session_id: str
    status: str = "unknown"
    connected: bool = False
    qr_code: str | None = None
    webhook_url: str | None = None
    last_error: str | None = None


class WhatsappWebhookDispatchResponse(BaseModel):
    accepted: bool = False
    connected: bool | None = None
    replied: bool = False
    session_id: str | None = None
    event: str | None = None
    sender: str | None = None
    reason: str | None = None
    reply_preview: str | None = None
    flow_result: str | None = None
    delivery_error: str | None = None


class ListFlowsResponse(BaseModel):
    flows: list[FlowSummary] = Field(default_factory=list)


class FlowRecord(BaseModel):
    name: str
    graph: CanvasGraph
    created_at: str
    updated_at: str


class RunSavedFlowRequest(BaseModel):
    input_text: str | None = None
    input_metadata: dict[str, Any] | None = None
    debug: bool = True


class RunSavedFlowByNameRequest(RunSavedFlowRequest):
    name: str = Field(min_length=1, max_length=120)


class CodegenRequest(BaseModel):
    graph: CanvasGraph
    response_only: bool = False


class CodegenResponse(BaseModel):
    code: str
    warnings: list[str] = Field(default_factory=list)


class ExportedFile(BaseModel):
    path: str
    content: str


class ExportProjectResponse(BaseModel):
    files: list[ExportedFile] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RunResult(BaseModel):
    success: bool
    stdout: str = ""
    clean_stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    code: str
    warnings: list[str] = Field(default_factory=list)
