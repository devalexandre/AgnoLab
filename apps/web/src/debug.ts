// Parsing of runner debug logs into per-node run badges. Extracted from App.tsx.

import type { CanvasGraph, RunResult } from "./types";
import { fieldValueAsString } from "./utils";

export interface DebugObservation {
  agentStatuses: Map<string, "running" | "completed">;
  toolStatuses: Map<string, "running" | "completed">;
  hasDebugLogs: boolean;
}

export interface NodeRunBadge {
  text: string;
  variant: "running" | "completed" | "tool-completed";
  title: string;
}

function normalizeDebugToken(value: unknown): string {
  return fieldValueAsString(value).trim().toLowerCase();
}

function toSnakeCase(value: unknown): string {
  return fieldValueAsString(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractFunctionNameFromCode(code: unknown): string {
  const text = fieldValueAsString(code);
  const match = text.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
  return match?.[1]?.toLowerCase() ?? "";
}

export function parseDebugObservation(runResult: RunResult | null): DebugObservation {
  const agentStatuses = new Map<string, "running" | "completed">();
  const toolStatuses = new Map<string, "running" | "completed">();
  const stdout = runResult?.stdout ?? "";
  let hasDebugLogs = false;
  let insideToolCallsSection = false;
  let currentRunnerToken = "";

  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("[debug]")) {
      hasDebugLogs = true;

      const genericAgentMatch = line.match(/^\[debug\]\[(.+?)\]/);
      if (genericAgentMatch) {
        const agentName = normalizeDebugToken(genericAgentMatch[1]);
        if (!agentStatuses.has(agentName)) {
          agentStatuses.set(agentName, "running");
        }
      }

      const runStartedMatch = line.match(/^\[debug\]\[(.+?)\]\s+RunStarted\b/);
      if (runStartedMatch) {
        agentStatuses.set(normalizeDebugToken(runStartedMatch[1]), "running");
      }

      const runCompletedMatch = line.match(/^\[debug\]\[(.+?)\]\s+RunCompleted\b/);
      if (runCompletedMatch) {
        agentStatuses.set(normalizeDebugToken(runCompletedMatch[1]), "completed");
      }

      const agentMatch = line.match(/^\[debug\]\[(.+?)\]\s+ToolCall(?:Started|Completed|Error)\b/);
      if (agentMatch) {
        const agentName = normalizeDebugToken(agentMatch[1]);
        if (!agentStatuses.has(agentName)) {
          agentStatuses.set(agentName, "running");
        }
      }

      const toolStartedMatch = line.match(/ToolCallStarted\b.*\btool=([^\s]+)/);
      if (toolStartedMatch) {
        toolStatuses.set(normalizeDebugToken(toolStartedMatch[1]), "running");
      }

      const toolCompletedMatch = line.match(/ToolCall(?:Completed|Error)\b.*\btool=([^\s]+)/);
      if (toolCompletedMatch) {
        toolStatuses.set(normalizeDebugToken(toolCompletedMatch[1]), "completed");
      }

      continue;
    }

    if (!line.startsWith("DEBUG")) {
      if (insideToolCallsSection && line.trim() === "") {
        insideToolCallsSection = false;
      }
      continue;
    }

    hasDebugLogs = true;

    const agnoRunnerIdMatch = line.match(/^DEBUG\s+\*+\s+(Agent|Team) ID:\s+(.+?)\s+\*+/);
    if (agnoRunnerIdMatch) {
      currentRunnerToken = toSnakeCase(agnoRunnerIdMatch[2]);
      if (currentRunnerToken) {
        agentStatuses.set(currentRunnerToken, "running");
      }
      continue;
    }

    if (/^DEBUG Tool Calls:/.test(line)) {
      insideToolCallsSection = true;
      continue;
    }

    if (/^DEBUG ======================== assistant =========================/.test(line)) {
      insideToolCallsSection = false;
    }

    const agnoRunStartMatch = line.match(/(?:Agent|Team) Run Start:/);
    if (agnoRunStartMatch && currentRunnerToken) {
      agentStatuses.set(currentRunnerToken, "running");
      continue;
    }

    const agnoRunEndMatch = line.match(/(?:Agent|Team) Run End:/);
    if (agnoRunEndMatch && currentRunnerToken) {
      agentStatuses.set(currentRunnerToken, "completed");
      continue;
    }

    const agnoAssistantMatch = line.match(/^DEBUG O total|^DEBUG [^\s].+/);
    if (agnoAssistantMatch && currentRunnerToken && !agentStatuses.has(currentRunnerToken)) {
      agentStatuses.set(currentRunnerToken, "running");
    }

    const agnoToolAddedMatch = line.match(/^DEBUG Added tool\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (agnoToolAddedMatch) {
      const toolName = normalizeDebugToken(agnoToolAddedMatch[1]);
      if (!toolStatuses.has(toolName)) {
        toolStatuses.set(toolName, "running");
      }
    }

    const agnoToolRunningMatch = line.match(/^DEBUG Running:\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    if (agnoToolRunningMatch) {
      toolStatuses.set(normalizeDebugToken(agnoToolRunningMatch[1]), "completed");
      continue;
    }

    if (insideToolCallsSection) {
      const toolNameMatch = line.match(/^\s*Name:\s+'([^']+)'/);
      if (toolNameMatch) {
        toolStatuses.set(normalizeDebugToken(toolNameMatch[1]), "completed");
        continue;
      }
    }
  }

  return {
    agentStatuses,
    toolStatuses,
    hasDebugLogs,
  };
}

export function deriveNodeRunBadges(graph: CanvasGraph | null, observation: DebugObservation): Record<string, NodeRunBadge> {
  if (!graph || !observation.hasDebugLogs) {
    return {};
  }

  const badges: Record<string, NodeRunBadge> = {};
  const propagatedStatuses = new Map<string, "running" | "completed">();
  const incomingByNode = new Map<string, string[]>();
  const outgoingByNode = new Map<string, string[]>();

  for (const node of graph.nodes) {
    incomingByNode.set(node.id, []);
    outgoingByNode.set(node.id, []);
  }

  for (const edge of graph.edges) {
    incomingByNode.get(edge.target)?.push(edge.source);
    outgoingByNode.get(edge.source)?.push(edge.target);
  }

  for (const node of graph.nodes) {
    if (node.type === "agent" || node.type === "team") {
      const agentConfig = (node.data.extras?.agentConfig as Record<string, unknown> | undefined) ?? {};
      const candidates = [
        normalizeDebugToken(node.data.name),
        toSnakeCase(node.data.name),
        normalizeDebugToken(agentConfig.id),
        toSnakeCase(agentConfig.id),
      ].filter(Boolean);
      const status = candidates
        .map((candidate) => observation.agentStatuses.get(candidate))
        .find(Boolean);
      if (status) {
        propagatedStatuses.set(node.id, status);
        badges[node.id] = {
          text: status === "completed" ? "Completed" : "Running",
          variant: status === "completed" ? "completed" : "running",
          title: `${node.data.name} appeared in the latest run logs.`,
        };
      }
      continue;
    }

    if (node.type === "tool") {
      const candidates = [
        normalizeDebugToken(node.data.extras?.functionName),
        toSnakeCase(node.data.extras?.functionName),
        extractFunctionNameFromCode(node.data.extras?.functionCode),
        normalizeDebugToken(node.data.extras?.builtinClassName),
        toSnakeCase(node.data.extras?.builtinClassName),
        normalizeDebugToken(node.data.extras?.builtinToolKey),
        toSnakeCase(node.data.extras?.builtinToolKey),
        normalizeDebugToken(node.data.name),
        toSnakeCase(node.data.name),
      ].filter(Boolean);

      const matchedStatus = candidates
        .map((candidate) => observation.toolStatuses.get(candidate))
        .find(Boolean);

      if (matchedStatus) {
        badges[node.id] = {
          text: matchedStatus === "completed" ? "Completed" : "Running",
          variant: matchedStatus === "completed" ? "tool-completed" : "running",
          title: `${node.data.name} appeared in the latest tool logs.`,
        };
      }
    }
  }

  if (propagatedStatuses.size === 0) {
    return badges;
  }

  const queue = [...propagatedStatuses.entries()];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }

    const [nodeId, status] = next;
    const neighbors = [...(incomingByNode.get(nodeId) ?? []), ...(outgoingByNode.get(nodeId) ?? [])];
    for (const neighborId of neighbors) {
      const neighborNode = graph.nodes.find((node) => node.id === neighborId);
      if (!neighborNode || neighborNode.type === "tool") {
        continue;
      }

      const currentStatus = propagatedStatuses.get(neighborId);
      if (currentStatus === "completed" || currentStatus === status) {
        continue;
      }

      propagatedStatuses.set(neighborId, status);
      queue.push([neighborId, status]);
    }
  }

  for (const node of graph.nodes) {
    const propagatedStatus = propagatedStatuses.get(node.id);
    if (badges[node.id] || !propagatedStatus) {
      continue;
    }

    badges[node.id] = {
      text: propagatedStatus === "completed" ? "Completed" : "Running",
      variant: propagatedStatus === "completed" ? "completed" : "running",
      title: `${node.data.name} is part of the connected path from the latest run.`,
    };
  }

  return badges;
}
