export type NodeType =
  | "input"
  | "rabbitmq_input"
  | "rabbitmq_output"
  | "kafka_input"
  | "kafka_output"
  | "redis_input"
  | "redis_output"
  | "nats_input"
  | "nats_output"
  | "sqs_input"
  | "sqs_output"
  | "pubsub_input"
  | "pubsub_output"
  | "agent"
  | "team"
  | "workflow"
  | "workflow_step"
  | "tool"
  | "skills"
  | "interface"
  | "condition"
  | "output"
  | "output_api"
  | "database"
  | "vector_db"
  | "knowledge"
  | "learning_machine"
  | "memory_manager"
  | "session_summary_manager"
  | "compression_manager";

export interface ProjectMeta {
  name: string;
  target: "agno-python" | "agnogo";
  runtime?: ProjectRuntimeConfig;
}

export interface ProjectRuntimeEnvVar {
  key: string;
  value: string;
}

export interface ProjectRuntimeConfig {
  envVars: ProjectRuntimeEnvVar[];
  authEnabled: boolean;
  authToken?: string | null;
}

export interface Position {
  x: number;
  y: number;
}

export interface NodeData {
  name: string;
  description?: string | null;
  instructions?: string | null;
  provider?: string | null;
  model?: string | null;
  temperature?: number | null;
  tools?: string[];
  prompt?: string | null;
  condition?: string | null;
  output_format?: string | null;
  extras?: Record<string, unknown>;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  position: Position;
  data: NodeData;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  source_handle?: string | null;
  target_handle?: string | null;
}

export interface CanvasGraph {
  project: ProjectMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CanvasTemplateSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  default_flow_name: string;
}

export interface SkillPathOption {
  path: string;
  label: string;
  source: string;
  validates: boolean;
  validation_error?: string | null;
}

export interface BuiltInToolFunctionOption {
  name: string;
  label: string;
  description?: string | null;
  signature: string;
  required_params: string[];
  optional_params: string[];
}

export interface RunResult {
  success: boolean;
  stdout: string;
  clean_stdout: string;
  stderr: string;
  exit_code?: number | null;
  code: string;
  warnings: string[];
}

export interface FlowSummary {
  name: string;
  updated_at: string;
}

export interface SaveFlowResponse {
  name: string;
  created_at: string;
  updated_at: string;
}

export interface FlowRecord {
  name: string;
  graph: CanvasGraph;
  created_at: string;
  updated_at: string;
}

export interface WhatsappSessionStatus {
  flow_name: string;
  node_id: string;
  node_name: string;
  session_id: string;
  status: string;
  connected: boolean;
  qr_code?: string | null;
  webhook_url?: string | null;
  last_error?: string | null;
}

export interface QueueSubscriberStatus {
  flow_name: string;
  node_id: string;
  node_name: string;
  provider: string;
  poll_interval_seconds: number;
  enabled: boolean;
  connected: boolean;
  status: string;
  last_checked_at?: string | null;
  last_triggered_at?: string | null;
  last_message_id?: string | null;
  last_payload_received_at?: string | null;
  last_payload_preview?: string | null;
  last_error?: string | null;
  last_result?: string | null;
}

export interface FlowRuntimeStatus {
  flow_name: string;
  active_runs: number;
  total_runs: number;
  success_runs: number;
  failed_runs: number;
  last_source?: string | null;
  last_started_at?: string | null;
  last_finished_at?: string | null;
  last_duration_ms?: number | null;
  last_error?: string | null;
}

export interface SavedUserTool {
  id: string;
  name: string;
  description?: string | null;
  functionName: string;
  functionCode: string;
  createdAt: string;
}

export interface StarterToolTemplate {
  id: string;
  name: string;
  description?: string | null;
  functionName: string;
  functionCode: string;
  prerequisite?: string | null;
}
