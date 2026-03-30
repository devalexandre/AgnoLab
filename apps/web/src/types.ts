export type NodeType = "input" | "agent" | "team" | "tool" | "condition" | "output" | "output_api";

export interface ProjectMeta {
  name: string;
  target: "agno-python" | "agnogo";
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

export interface RuntimeCredentials {
  openai_api_key?: string | null;
}

export interface RunResult {
  success: boolean;
  stdout: string;
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
