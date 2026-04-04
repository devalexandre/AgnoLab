import { BuiltInToolFunctionOption, CanvasGraph, CanvasTemplateSummary, FlowRecord, FlowRuntimeStatus, FlowSummary, QueueSubscriberStatus, RunResult, SaveFlowResponse, SkillPathOption, WhatsappSessionStatus } from "./types";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveApiBase(): string {
  const configuredBase = import.meta.env.VITE_API_URL?.trim();
  if (configuredBase) {
    return trimTrailingSlash(configuredBase);
  }

  if (typeof window !== "undefined") {
    const { origin, hostname, protocol, port } = window.location;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
    if (isLocalHost && port !== "8000") {
      return `${protocol}//${hostname}:8000`;
    }
    return trimTrailingSlash(origin);
  }

  return "http://localhost:8000";
}

export const API_BASE = resolveApiBase();

export async function fetchDefaultGraph(): Promise<CanvasGraph> {
  const response = await fetch(`${API_BASE}/api/canvas/default`);
  if (!response.ok) {
    throw new Error("Failed to load default graph");
  }
  return response.json();
}

export async function listCanvasTemplates(): Promise<CanvasTemplateSummary[]> {
  const response = await fetch(`${API_BASE}/api/canvas/templates`);
  if (!response.ok) {
    throw new Error("Failed to load canvas templates");
  }
  const payload = (await response.json()) as { templates: CanvasTemplateSummary[] };
  return Array.isArray(payload.templates) ? payload.templates : [];
}

export async function fetchCanvasTemplate(templateId: string): Promise<CanvasGraph> {
  const response = await fetch(`${API_BASE}/api/canvas/templates/${encodeURIComponent(templateId)}`);
  if (!response.ok) {
    throw new Error(`Failed to load canvas template: ${templateId}`);
  }
  return response.json();
}

export async function listSkillPaths(): Promise<SkillPathOption[]> {
  const response = await fetch(`${API_BASE}/api/skills/paths`);
  if (!response.ok) {
    throw new Error("Failed to load local skill paths");
  }
  const payload = (await response.json()) as { paths?: SkillPathOption[] };
  return Array.isArray(payload.paths) ? payload.paths : [];
}

export async function listBuiltInToolFunctions(input: {
  importPath: string;
  className: string;
  config?: string;
}): Promise<{ functions: BuiltInToolFunctionOption[]; error?: string | null }> {
  const response = await fetch(`${API_BASE}/api/tools/builtin/functions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      import_path: input.importPath,
      class_name: input.className,
      config: input.config ?? "",
    }),
  });
  if (!response.ok) {
    throw new Error("Failed to inspect built-in tool functions");
  }
  const payload = (await response.json()) as { functions?: BuiltInToolFunctionOption[]; error?: string | null };
  return {
    functions: Array.isArray(payload.functions) ? payload.functions : [],
    error: payload.error,
  };
}

export async function previewCode(graph: CanvasGraph): Promise<{ code: string; warnings: string[] }> {
  const response = await fetch(`${API_BASE}/api/codegen/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph }),
  });
  if (!response.ok) {
    throw new Error("Failed to generate code preview");
  }
  return response.json();
}

export async function runGraph(
  graph: CanvasGraph,
  responseOnly = false,
): Promise<RunResult> {
  const response = await fetch(`${API_BASE}/api/executor/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, response_only: responseOnly }),
  });
  if (!response.ok) {
    throw new Error("Failed to run graph");
  }
  return response.json();
}

export async function saveFlow(name: string, graph: CanvasGraph): Promise<SaveFlowResponse> {
  const response = await fetch(`${API_BASE}/api/flows/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, graph }),
  });
  if (!response.ok) {
    throw new Error("Failed to save flow");
  }
  return response.json();
}

export async function listFlows(): Promise<FlowSummary[]> {
  const response = await fetch(`${API_BASE}/api/flows`);
  if (!response.ok) {
    throw new Error("Failed to list flows");
  }
  const payload = (await response.json()) as { flows: FlowSummary[] };
  return payload.flows;
}

export async function listFlowRuntimeStatuses(flowName?: string): Promise<FlowRuntimeStatus[]> {
  const query = flowName?.trim() ? `?flow_name=${encodeURIComponent(flowName.trim())}` : "";
  const response = await fetch(`${API_BASE}/api/flows/runtime/statuses${query}`);
  if (!response.ok) {
    throw new Error("Failed to list flow runtime statuses");
  }
  const payload = (await response.json()) as { statuses?: FlowRuntimeStatus[] };
  return Array.isArray(payload.statuses) ? payload.statuses : [];
}

export async function fetchFlowByName(name: string): Promise<FlowRecord> {
  const response = await fetch(`${API_BASE}/api/flows/${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error(`Failed to load flow: ${name}`);
  }
  return response.json();
}

export async function runFlowByName(
  name: string,
  inputText: string,
  inputMetadata: Record<string, unknown> | null,
  authToken?: string | null,
): Promise<RunResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken?.trim()) {
    headers.Authorization = `Bearer ${authToken.trim()}`;
  }

  const response = await fetch(`${API_BASE}/api/flows/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name,
      input_text: inputText || null,
      input_metadata: inputMetadata,
    }),
  });
  if (!response.ok) {
    throw new Error("Failed to run saved flow");
  }
  return response.json();
}

export async function listOllamaModels(baseUrl?: string): Promise<string[]> {
  const query = baseUrl?.trim() ? `?base_url=${encodeURIComponent(baseUrl)}` : "";
  const response = await fetch(`${API_BASE}/api/providers/ollama/models${query}`);
  if (!response.ok) {
    throw new Error("Failed to list local Ollama models");
  }
  const payload = (await response.json()) as { models?: string[] };
  return Array.isArray(payload.models) ? payload.models : [];
}

export async function fetchWhatsappSessionStatus(flowName: string, nodeId: string): Promise<WhatsappSessionStatus> {
  const response = await fetch(
    `${API_BASE}/api/integrations/whatsapp/${encodeURIComponent(flowName)}/${encodeURIComponent(nodeId)}/session/status`,
  );
  if (!response.ok) {
    throw new Error("Failed to load WhatsApp session status");
  }
  return response.json();
}

export async function startWhatsappSession(flowName: string, nodeId: string): Promise<WhatsappSessionStatus> {
  const response = await fetch(
    `${API_BASE}/api/integrations/whatsapp/${encodeURIComponent(flowName)}/${encodeURIComponent(nodeId)}/session/start`,
    {
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error("Failed to start WhatsApp session");
  }
  return response.json();
}

export async function stopWhatsappSession(flowName: string, nodeId: string): Promise<WhatsappSessionStatus> {
  const response = await fetch(
    `${API_BASE}/api/integrations/whatsapp/${encodeURIComponent(flowName)}/${encodeURIComponent(nodeId)}/session/stop`,
    {
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error("Failed to stop WhatsApp session");
  }
  return response.json();
}

export async function fetchQueueSubscriberStatus(flowName: string, nodeId: string): Promise<QueueSubscriberStatus> {
  const response = await fetch(
    `${API_BASE}/api/integrations/queues/${encodeURIComponent(flowName)}/${encodeURIComponent(nodeId)}/subscriber/status`,
  );
  if (!response.ok) {
    throw new Error("Failed to load queue subscriber status");
  }
  return response.json();
}

export async function startQueueSubscriber(flowName: string, nodeId: string): Promise<QueueSubscriberStatus> {
  const response = await fetch(
    `${API_BASE}/api/integrations/queues/${encodeURIComponent(flowName)}/${encodeURIComponent(nodeId)}/subscriber/start`,
    {
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error("Failed to start queue subscriber");
  }
  return response.json();
}

export async function stopQueueSubscriber(flowName: string, nodeId: string): Promise<QueueSubscriberStatus> {
  const response = await fetch(
    `${API_BASE}/api/integrations/queues/${encodeURIComponent(flowName)}/${encodeURIComponent(nodeId)}/subscriber/stop`,
    {
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error("Failed to stop queue subscriber");
  }
  return response.json();
}
