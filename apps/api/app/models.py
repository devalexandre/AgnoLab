from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    INPUT = "input"
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


class ProjectMeta(BaseModel):
    name: str = "Untitled Agno Flow"
    target: TargetRuntime = TargetRuntime.AGNO_PYTHON


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


class RuntimeCredentials(BaseModel):
    openai_api_key: str | None = None


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


class ListFlowsResponse(BaseModel):
    flows: list[FlowSummary] = Field(default_factory=list)


class FlowRecord(BaseModel):
    name: str
    graph: CanvasGraph
    created_at: str
    updated_at: str


class RunSavedFlowRequest(BaseModel):
    credentials: RuntimeCredentials | None = None
    input_text: str | None = None
    input_metadata: dict[str, Any] | None = None
    debug: bool = True


class RunSavedFlowByNameRequest(RunSavedFlowRequest):
    name: str = Field(min_length=1, max_length=120)


class CodegenRequest(BaseModel):
    graph: CanvasGraph
    credentials: RuntimeCredentials | None = None
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
