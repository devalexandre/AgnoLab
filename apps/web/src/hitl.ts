// JSON payload parsing and human-in-the-loop (HITL) metadata helpers.
// Extracted from App.tsx; pure functions over graphs and run results.

import type { CanvasGraph, RunResult } from "./types";
import { fieldValueAsString } from "./utils";

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type HitlAutoApproveSelection = "" | "true" | "false";

export function normalizeHitlAutoApproveSelection(rawValue: unknown): HitlAutoApproveSelection {
  if (rawValue === true) {
    return "true";
  }
  if (rawValue === false) {
    return "false";
  }
  const normalized = fieldValueAsString(rawValue).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return "true";
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return "false";
  }
  return "";
}

export function parseHitlUserInput(rawValue: unknown): Record<string, unknown> | null {
  if (!rawValue) {
    return null;
  }

  if (typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return rawValue as Record<string, unknown>;
  }

  const text = fieldValueAsString(rawValue).trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildInputMetadataFromExtras(extras: Record<string, unknown> | undefined): Record<string, unknown> {
  const normalizedExtras = extras ?? {};
  const metadata = parseJsonObject(fieldValueAsString(normalizedExtras.payloadJson)) ?? {};

  if (Object.prototype.hasOwnProperty.call(normalizedExtras, "hitlAutoApprove")) {
    const hitlAutoApprove = normalizeHitlAutoApproveSelection(normalizedExtras.hitlAutoApprove);
    if (hitlAutoApprove !== "") {
      metadata.hitl_auto_approve = hitlAutoApprove === "true";
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalizedExtras, "hitlUserInputJson")) {
    const rawHitlUserInput = normalizedExtras.hitlUserInputJson;
    const hitlUserInput = parseHitlUserInput(rawHitlUserInput);
    if (hitlUserInput) {
      metadata.hitl_user_input = hitlUserInput;
    }
  }

  return metadata;
}

export function stringifyJsonObject(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function graphHasHitlConfirmationGate(graph: CanvasGraph): boolean {
  return graph.nodes.some((node) => node.type === "workflow_step" && Boolean(node.data.extras?.requiresConfirmation));
}

export function getHitlConfirmationStepNames(graph: CanvasGraph): Set<string> {
  return new Set(
    graph.nodes
      .filter((node) => node.type === "workflow_step" && Boolean(node.data.extras?.requiresConfirmation))
      .map((node) => fieldValueAsString(node.data.name).trim())
      .filter(Boolean),
  );
}

export function extractPausedWorkflowStepName(text: string): string | null {
  const match = text.match(/Workflow paused at '([^']+)'/);
  return match?.[1] ?? null;
}

export function shouldPromptHitlConfirmationFromRunResult(graph: CanvasGraph, result: RunResult | null): boolean {
  if (!result) {
    return false;
  }
  const pausedStepName = extractPausedWorkflowStepName(result.clean_stdout || result.stdout || "");
  if (!pausedStepName) {
    return false;
  }
  return getHitlConfirmationStepNames(graph).has(pausedStepName);
}

export function shouldPromptHitlConfirmation(graph: CanvasGraph): boolean {
  if (!graphHasHitlConfirmationGate(graph)) {
    return false;
  }
  const inputNode = graph.nodes.find((node) => node.type === "input");
  if (!inputNode) {
    return false;
  }
  const metadata = buildInputMetadataFromExtras(inputNode.data.extras);
  return metadata.hitl_auto_approve !== true;
}

export function prepareGraphWithResolvedInputMetadata(
  graph: CanvasGraph,
  options?: {
    forceHitlAutoApprove?: boolean;
  },
): CanvasGraph {
  const inputNode = graph.nodes.find((node) => node.type === "input");
  if (!inputNode) {
    return graph;
  }

  const currentExtras = inputNode.data.extras ?? {};
  const metadata = buildInputMetadataFromExtras(currentExtras);
  if (options?.forceHitlAutoApprove) {
    metadata.hitl_auto_approve = true;
  }

  const nextExtras = {
    ...currentExtras,
    payloadJson: stringifyJsonObject(metadata),
    hitlAutoApprove:
      typeof metadata.hitl_auto_approve === "boolean"
        ? metadata.hitl_auto_approve
          ? "true"
          : "false"
        : "",
    hitlUserInputJson:
      metadata.hitl_user_input && typeof metadata.hitl_user_input === "object" && !Array.isArray(metadata.hitl_user_input)
        ? stringifyJsonObject(metadata.hitl_user_input as Record<string, unknown>)
        : "",
  };

  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === inputNode.id
        ? {
            ...node,
            data: {
              ...node.data,
              extras: nextExtras,
            },
          }
        : node,
    ),
  };
}
