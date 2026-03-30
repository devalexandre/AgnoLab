import { CanvasGraph, FlowRecord, FlowSummary, RunResult, RuntimeCredentials, SaveFlowResponse } from "./types";

const API_BASE = "http://localhost:8000";

export async function fetchDefaultGraph(): Promise<CanvasGraph> {
  const response = await fetch(`${API_BASE}/api/canvas/default`);
  if (!response.ok) {
    throw new Error("Failed to load default graph");
  }
  return response.json();
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
  credentials: RuntimeCredentials,
): Promise<RunResult> {
  const response = await fetch(`${API_BASE}/api/executor/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, credentials }),
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
  credentials: RuntimeCredentials,
): Promise<RunResult> {
  const response = await fetch(`${API_BASE}/api/flows/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      input_text: inputText || null,
      input_metadata: inputMetadata,
      credentials,
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
