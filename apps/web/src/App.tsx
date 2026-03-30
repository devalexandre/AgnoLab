import { type ChangeEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { fetchDefaultGraph, fetchFlowByName, listFlows, listOllamaModels, previewCode, runFlowByName, runGraph, saveFlow } from "./api";
import { AGENT_FIELDS, AGENT_FIELD_GROUPS, AGNO_MODEL_PROVIDER_OPTIONS, type AgentFieldDefinition } from "./agentConfig";
import MonacoToolEditor from "./MonacoToolEditor";
import { NODE_CATALOG, NODE_CATEGORIES, canConnect, listNodeTypes } from "./nodeCatalog";
import { buildProviderConfig, getProviderDefinition, normalizeProviderId } from "./providerCatalog";
import { STARTER_TOOLS } from "./starterTools";
import { BUILT_IN_TOOLS, BUILT_IN_TOOL_CATEGORIES, getBuiltInTool, type BuiltInToolDefinition } from "./toolCatalog";
import { ToolIcon, toolIconColor } from "./toolIcons";
import { CanvasGraph, FlowSummary, GraphEdge, NodeData, RunResult, RuntimeCredentials, SavedUserTool, StarterToolTemplate } from "./types";

const STORAGE_KEY = "agnolab.runtime_credentials";
const MY_TOOLS_STORAGE_KEY = "agnolab.my_tools";
const API_BASE = "http://localhost:8000";
const NODE_WIDTH = 180;
const NODE_MIN_HEIGHT = 80;
const DEFAULT_SECTION_OPEN = true;

interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
}

interface PointerPosition {
  x: number;
  y: number;
}

interface DebugObservation {
  agentStatuses: Map<string, "running" | "completed">;
  toolStatuses: Map<string, "running" | "completed">;
  hasDebugLogs: boolean;
}

interface NodeRunBadge {
  text: string;
  variant: "running" | "completed" | "tool-completed";
  title: string;
}

interface ChatDraft {
  text: string;
  metadata: string;
  fileAlias: string;
  fileName: string;
  fileMimeType: string;
  fileEncoding: string;
  fileBase64: string;
  fileContent: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  attachmentName?: string;
}

function extractAgentResponse(stdout: string): string {
  const filteredLines = stdout
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("[debug]") && !line.startsWith("DEBUG"));

  const compacted: string[] = [];
  for (const line of filteredLines) {
    const isBlank = line.trim() === "";
    const previousIsBlank = compacted.length > 0 && compacted[compacted.length - 1].trim() === "";
    if (isBlank && previousIsBlank) {
      continue;
    }
    compacted.push(line);
  }

  return compacted.join("\n").trim();
}

function sanitizeGeneratedCode(code: string): string {
  return code.replace(
    /(_input_file_base64\s*=\s*)'[^']*'/g,
    "$1'<omitted from code preview; injected only at runtime>'",
  );
}

function slugifyFlowName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
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

function downloadAsFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function buildRunFlowCurlCommand(flowName: string): string {
  return [
    `curl -X POST "${API_BASE}/api/flows/run" \\`,
    "  -H \"Content-Type: application/json\" \\",
    "  -d '{",
    `    \"name\": \"${flowName}\",`,
    "    \"debug\": false,",
    "    \"input_text\": \"Hello from POST\",",
    "    \"input_metadata\": {",
    "      \"tenant\": \"acme\"",
    "    }",
    "  }'",
  ].join("\n");
}

function getFlowNameFromPath(pathname: string): string | null {
  const prefix = "/flow/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const raw = pathname.slice(prefix.length).trim();
  if (!raw) {
    return null;
  }
  return decodeURIComponent(raw);
}

function buildFlowPath(flowName: string): string {
  return `/flow/${encodeURIComponent(flowName)}`;
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

function parseDebugObservation(runResult: RunResult | null): DebugObservation {
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

function deriveNodeRunBadges(graph: CanvasGraph | null, observation: DebugObservation): Record<string, NodeRunBadge> {
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

function updateNodeData(graph: CanvasGraph | null, nodeId: string, patch: Partial<NodeData>): CanvasGraph | null {
  if (!graph) {
    return graph;
  }
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            data: {
              ...node.data,
              ...patch,
            },
          }
        : node,
    ),
  };
}

function createNodeId(graph: CanvasGraph, type: keyof typeof NODE_CATALOG): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now()}_${graph.nodes.length + 1}`;

  return `${type}_${randomPart}`;
}

function createNodePosition(graph: CanvasGraph): { x: number; y: number } {
  const baseX = 280;
  const baseY = 240;
  const perRow = 3;
  const index = graph.nodes.length;
  return {
    x: baseX + (index % perRow) * 230,
    y: baseY + Math.floor(index / perRow) * 170,
  };
}

function centerGraphInCanvas(graph: CanvasGraph, canvasWidth: number, canvasHeight: number): CanvasGraph {
  if (graph.nodes.length === 0) {
    return graph;
  }

  const minX = Math.min(...graph.nodes.map((node) => node.position.x));
  const minY = Math.min(...graph.nodes.map((node) => node.position.y));
  const maxX = Math.max(...graph.nodes.map((node) => node.position.x + NODE_WIDTH));
  const maxY = Math.max(...graph.nodes.map((node) => node.position.y + NODE_MIN_HEIGHT));

  const graphWidth = maxX - minX;
  const graphHeight = maxY - minY;

  const usableLeft = 60;
  const usableRight = 60;
  const usableTop = 210;
  const usableBottom = 60;
  const usableWidth = Math.max(320, canvasWidth - usableLeft - usableRight);
  const usableHeight = Math.max(240, canvasHeight - usableTop - usableBottom);

  const targetMinX = usableLeft + Math.max(0, (usableWidth - graphWidth) / 2);
  const targetMinY = usableTop + Math.max(0, (usableHeight - graphHeight) / 2);
  const offsetX = targetMinX - minX;
  const offsetY = targetMinY - minY;

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: {
        x: Math.max(24, node.position.x + offsetX),
        y: Math.max(24, node.position.y + offsetY),
      },
    })),
  };
}

function getAgentConfig(data: NodeData): Record<string, unknown> {
  return (data.extras?.agentConfig as Record<string, unknown> | undefined) ?? {};
}

function updateAgentConfig(data: NodeData, key: string, value: unknown): NodeData {
  return {
    ...data,
    extras: {
      ...(data.extras ?? {}),
      agentConfig: {
        ...getAgentConfig(data),
        [key]: value,
      },
    },
  };
}

function getProviderConfig(data: NodeData): Record<string, unknown> {
  return (data.extras?.providerConfig as Record<string, unknown> | undefined) ?? {};
}

function updateProviderConfig(data: NodeData, key: string, value: unknown): NodeData {
  return {
    ...data,
    extras: {
      ...(data.extras ?? {}),
      providerConfig: {
        ...getProviderConfig(data),
        [key]: value,
      },
    },
  };
}

function applyProviderPreset(data: NodeData, providerPresetId: string): NodeData {
  const normalizedPreset = providerPresetId.trim().toLowerCase();
  if (!normalizedPreset) {
    return updateProviderConfig(data, "provider_profile", "");
  }

  const providerDefinition = getProviderDefinition(normalizedPreset);
  if (!providerDefinition) {
    return updateProviderConfig(data, "provider_profile", normalizedPreset);
  }

  const nextProviderConfig = {
    ...buildProviderConfig(providerDefinition.id),
    ...getProviderConfig(data),
    provider_profile: providerDefinition.id,
    provider_api_key_env: providerDefinition.key,
    provider_api_key: "",
    provider_base_url_env: providerDefinition.baseUrlEnv ?? "",
    provider_base_url: providerDefinition.url,
    provider_execution_timeout_seconds: providerDefinition.supportsLocalModels ? "120" : "",
  };

  return {
    ...data,
    provider: providerDefinition.id,
    model: providerDefinition.model,
    extras: {
      ...(data.extras ?? {}),
      providerConfig: nextProviderConfig,
    },
  };
}

function updateToolConfig(data: NodeData, patch: Record<string, unknown>): NodeData {
  return {
    ...data,
    extras: {
      ...(data.extras ?? {}),
      ...patch,
    },
  };
}

function createBuiltInToolData(tool: BuiltInToolDefinition, index: number): NodeData {
  return {
    name: tool.label,
    description: tool.description,
    extras: {
      toolMode: "builtin",
      builtinToolKey: tool.key,
      builtinImportPath: tool.importPath,
      builtinClassName: tool.className,
      builtinConfig: tool.configTemplate ?? "",
      functionName: `tool_${index}`,
      functionCode: `def tool_${index}(value: str) -> str:\n    return value\n`,
    },
  };
}

function createSavedToolNodeData(tool: SavedUserTool): NodeData {
  return {
    name: tool.name,
    description: tool.description,
    extras: {
      toolMode: "function",
      functionName: tool.functionName,
      functionCode: tool.functionCode,
    },
  };
}

function createStarterToolNodeData(tool: StarterToolTemplate): NodeData {
  return {
    name: tool.name,
    description: tool.description,
    extras: {
      toolMode: "function",
      functionName: tool.functionName,
      functionCode: tool.functionCode,
    },
  };
}

function getToolMode(data: NodeData): "builtin" | "function" {
  return (data.extras?.toolMode as "builtin" | "function" | undefined) ?? "builtin";
}

function getInputMode(data: NodeData): "text" | "file" | "mixed" {
  return (data.extras?.inputMode as "text" | "file" | "mixed" | undefined) ?? "text";
}

function fieldValueAsString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getInputText(data: NodeData): string {
  return fieldValueAsString(data.extras?.inputText ?? data.prompt);
}

function getAttachedFileName(data: NodeData): string {
  return fieldValueAsString(data.extras?.attachedFileName);
}

function updateInputNodePayload(graph: CanvasGraph, payload: ChatDraft): CanvasGraph {
  const inputNode = graph.nodes.find((node) => node.type === "input");
  if (!inputNode) {
    return graph;
  }

  const currentExtras = inputNode.data.extras ?? {};
  const inputMode = getInputMode(inputNode.data);
  const nextText = inputMode === "file" ? getInputText(inputNode.data) : payload.text;
  const nextPrompt = inputMode === "file" ? inputNode.data.prompt : payload.text;

  const nextExtras = {
    ...currentExtras,
    inputText: nextText,
    payloadJson: payload.metadata,
    attachedFileName: payload.fileName,
    attachedFileAlias: payload.fileAlias || payload.fileName,
    attachedFileMimeType: payload.fileMimeType,
    attachedFileEncoding: payload.fileEncoding || "base64",
    attachedFileBase64: payload.fileBase64,
    attachedFileContent: payload.fileContent,
  };

  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === inputNode.id
        ? {
            ...node,
            data: {
              ...node.data,
              prompt: nextPrompt,
              extras: nextExtras,
            },
          }
        : node,
    ),
  };
}

function getPrimaryInputNode(graph: CanvasGraph | null): { id: string; data: NodeData } | null {
  if (!graph) {
    return null;
  }
  const node = graph.nodes.find((candidate) => candidate.type === "input");
  if (!node) {
    return null;
  }
  return { id: node.id, data: node.data };
}

function getCanvasNodeLabel(data: NodeData, type: keyof typeof NODE_CATALOG): string {
  if (type === "tool") {
    const mode = getToolMode(data);
    if (mode === "builtin") {
      return fieldValueAsString(data.extras?.builtinClassName) || "Built-in Tool";
    }
    return "Function Tool";
  }

  return NODE_CATALOG[type].label;
}

function getCanvasNodeMeta(node: { type: keyof typeof NODE_CATALOG; data: NodeData }): string {
  if (node.type === "agent") {
    const providerConfig = getProviderConfig(node.data);
    const provider = fieldValueAsString(node.data.provider) || fieldValueAsString(providerConfig.provider_profile);
    if (provider && node.data.model) {
      return `${provider}:${node.data.model}`;
    }
  }

  if (node.type === "input") {
    const inputMode = getInputMode(node.data);
    const inputText = getInputText(node.data);
    const attachedFileName = getAttachedFileName(node.data);

    if (inputMode === "file" && attachedFileName) {
      return `File: ${attachedFileName}`;
    }

    if (inputMode === "mixed" && attachedFileName) {
      return inputText || `Text + file: ${attachedFileName}`;
    }

    return inputText || attachedFileName || "Configured in panel";
  }

  if (node.type === "output_api") {
    const apiUrl = fieldValueAsString(node.data.extras?.apiUrl);
    return apiUrl || "POST URL not configured";
  }

  return node.data.model || node.data.prompt || node.data.output_format || "Configured in panel";
}

function getNodeVisualIcon(node: { type: keyof typeof NODE_CATALOG; data: NodeData }) {
  if (node.type === "tool" && getToolMode(node.data) === "builtin") {
    const tool = getBuiltInTool(fieldValueAsString(node.data.extras?.builtinToolKey));
    if (tool) {
      return {
        color: toolIconColor(tool),
        icon: <ToolIcon toolKey={tool.key} category={tool.category} />,
      };
    }
  }

  return {
    color: NODE_CATALOG[node.type].color,
    icon: <NodeIcon type={node.type} />,
  };
}

function parseFieldValue(field: AgentFieldDefinition, rawValue: string, checked: boolean): unknown {
  if (field.type === "checkbox") {
    return checked;
  }

  if (field.type === "number") {
    return rawValue === "" ? undefined : Number(rawValue);
  }

  return rawValue;
}

function NodeIcon({ type }: { type: keyof typeof NODE_CATALOG }) {
  if (type === "input") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12h10" />
        <path d="M10 6l6 6-6 6" />
      </svg>
    );
  }

  if (type === "agent") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M6.5 19c1.2-3 3.1-4.5 5.5-4.5S16.3 16 17.5 19" />
      </svg>
    );
  }

  if (type === "team") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="9" r="2.5" />
        <circle cx="16" cy="9" r="2.5" />
        <path d="M4.5 18c.9-2.4 2.3-3.6 3.5-3.6S10.6 15.6 11.5 18" />
        <path d="M12.5 18c.9-2.4 2.3-3.6 3.5-3.6s2.6 1.2 3.5 3.6" />
      </svg>
    );
  }

  if (type === "condition") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l8 9-8 9-8-9 8-9z" />
      </svg>
    );
  }

  if (type === "tool") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.5 5.5a4 4 0 0 0-5 5L5 15l4 4 4.5-4.5a4 4 0 0 0 5-5l-2.5 2.5-3-3L14.5 5.5z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M9 10h6" />
      <path d="M9 14h4" />
    </svg>
  );
}

export default function App() {
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const hasAutoCenteredRef = useRef(false);
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);
  const [graph, setGraph] = useState<CanvasGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<RuntimeCredentials>({});
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pendingConnectionSourceId, setPendingConnectionSourceId] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<"properties" | "code" | "runtime">("properties");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [editingFunctionNodeId, setEditingFunctionNodeId] = useState<string | null>(null);
  const [myTools, setMyTools] = useState<SavedUserTool[]>([]);
  const [connectionPointer, setConnectionPointer] = useState<PointerPosition | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [outputResponseOnly, setOutputResponseOnly] = useState(false);
  const [flowName, setFlowName] = useState("support_agent_flow");
  const [savedFlows, setSavedFlows] = useState<FlowSummary[]>([]);
  const [runByNameInputText, setRunByNameInputText] = useState("");
  const [runByNameMetadata, setRunByNameMetadata] = useState("{}\n");
  const [isSavingFlow, setIsSavingFlow] = useState(false);
  const [isRunningSavedFlow, setIsRunningSavedFlow] = useState(false);
  const [savedFlowCurlModal, setSavedFlowCurlModal] = useState<{ name: string; command: string } | null>(null);
  const [didCopyCurl, setDidCopyCurl] = useState(false);
  const [isLoadingRouteFlow, setIsLoadingRouteFlow] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState<ChatDraft>({
    text: "",
    metadata: "{}\n",
    fileAlias: "",
    fileName: "",
    fileMimeType: "",
    fileEncoding: "base64",
    fileBase64: "",
    fileContent: "",
  });
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false);
  const [ollamaModelOptions, setOllamaModelOptions] = useState<string[]>([]);
  const [ollamaModelsRefreshKey, setOllamaModelsRefreshKey] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const isHomeRoute = currentPath === "/";
  const routeFlowName = useMemo(() => getFlowNameFromPath(currentPath), [currentPath]);

  useEffect(() => {
    listFlows()
      .then((flows) => {
        setSavedFlows(flows);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (isHomeRoute) {
      setGraph(null);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      return;
    }

    const targetFlowName = routeFlowName ?? "";
    if (!targetFlowName) {
      window.history.replaceState({}, "", "/");
      setCurrentPath("/");
      return;
    }

    let cancelled = false;

    async function loadFlowForRoute() {
      setIsLoadingRouteFlow(true);
      try {
        if (targetFlowName === "new") {
          const defaultGraph = await fetchDefaultGraph();
          if (cancelled) {
            return;
          }
          hasAutoCenteredRef.current = false;
          setGraph(defaultGraph);
          setFlowName("new_flow");
          setHomeError(null);
          return;
        }

        const record = await fetchFlowByName(targetFlowName);
        if (cancelled) {
          return;
        }
        hasAutoCenteredRef.current = false;
        setGraph(record.graph);
        setFlowName(slugifyFlowName(record.name) || record.name);
        setHomeError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setHomeError(error instanceof Error ? error.message : "Failed to load flow from route.");
      } finally {
        if (!cancelled) {
          setIsLoadingRouteFlow(false);
        }
      }
    }

    loadFlowForRoute().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [isHomeRoute, routeFlowName]);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return;
    }
    try {
      setCredentials(JSON.parse(saved));
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    const savedTools = window.localStorage.getItem(MY_TOOLS_STORAGE_KEY);
    if (!savedTools) {
      return;
    }
    try {
      setMyTools(JSON.parse(savedTools));
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  }, [credentials]);

  useEffect(() => {
    window.localStorage.setItem(MY_TOOLS_STORAGE_KEY, JSON.stringify(myTools));
  }, [myTools]);

  useEffect(() => {
    if (!graph) {
      return;
    }
    previewCode(graph)
      .then((response) => {
        setCode(response.code);
        setWarnings(response.warnings);
      })
      .catch(console.error);
  }, [graph]);

  useEffect(() => {
    if (!graph || !canvasRef.current || hasAutoCenteredRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 100) {
      return;
    }

    hasAutoCenteredRef.current = true;
    setGraph(centerGraphInCanvas(graph, rect.width, rect.height));
  }, [graph]);

  useEffect(() => {
    if (!dragState || !graph || !canvasRef.current) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) {
        return;
      }

      const nextX = Math.max(
        0,
        Math.min(canvasRect.width - NODE_WIDTH, event.clientX - canvasRect.left - dragState.offsetX),
      );
      const nextY = Math.max(
        0,
        Math.min(canvasRect.height - NODE_MIN_HEIGHT, event.clientY - canvasRect.top - dragState.offsetY),
      );

      setGraph((currentGraph) => {
        if (!currentGraph) {
          return currentGraph;
        }

        return {
          ...currentGraph,
          nodes: currentGraph.nodes.map((node) =>
            node.id === dragState.nodeId
              ? {
                  ...node,
                  position: {
                    x: nextX,
                    y: nextY,
                  },
                }
              : node,
          ),
        };
      });
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, graph]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedNodeId && !selectedEdgeId) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.closest(".monaco-editor"));

      if (isEditableTarget) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (selectedEdgeId) {
          deleteSelectedEdge();
          return;
        }
        deleteSelectedNode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedNodeId, selectedEdgeId, graph, pendingConnectionSourceId, editingFunctionNodeId]);

  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = graph?.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const editingFunctionNode = graph?.nodes.find((node) => node.id === editingFunctionNodeId) ?? null;
  const nodeMap = useMemo(
    () => Object.fromEntries((graph?.nodes ?? []).map((node) => [node.id, node])),
    [graph],
  );
  const displayedCode = useMemo(() => sanitizeGeneratedCode(code), [code]);
  const debugObservation = useMemo(() => parseDebugObservation(runResult), [runResult]);
  const nodeRunBadges = useMemo(() => deriveNodeRunBadges(graph, debugObservation), [graph, debugObservation]);
  const displayedStdout = useMemo(() => {
    if (!runResult?.stdout) {
      return "";
    }
    if (!outputResponseOnly) {
      return runResult.stdout;
    }
    return extractAgentResponse(runResult.stdout);
  }, [runResult, outputResponseOnly]);
  const pendingSourceNode = pendingConnectionSourceId ? nodeMap[pendingConnectionSourceId] : null;
  const inputNode = useMemo(() => getPrimaryInputNode(graph), [graph]);
  const inputMode = useMemo(() => (inputNode ? getInputMode(inputNode.data) : "text"), [inputNode]);
  const selectedAgentProvider = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "agent") {
      return "";
    }
    const providerConfig = getProviderConfig(selectedNode.data);
    const providerValue =
      fieldValueAsString(selectedNode.data.provider) || fieldValueAsString(providerConfig.provider_profile);
    return normalizeProviderId(providerValue);
  }, [selectedNode]);
  const selectedAgentProviderDefinition = useMemo(() => getProviderDefinition(selectedAgentProvider), [selectedAgentProvider]);
  const selectedAgentBaseUrl = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "agent") {
      return "";
    }
    const providerConfig = getProviderConfig(selectedNode.data);
    return fieldValueAsString(providerConfig.provider_base_url || selectedAgentProviderDefinition?.url || "");
  }, [selectedNode, selectedAgentProviderDefinition]);
  const chatHasText = chatDraft.text.trim().length > 0;
  const chatHasFile = Boolean(chatDraft.fileName);
  const canSendChatMessage =
    inputMode === "file"
      ? chatHasFile
      : inputMode === "mixed"
        ? chatHasText || chatHasFile
        : chatHasText;

  useEffect(() => {
    if (!inputNode) {
      return;
    }

    setChatDraft((current) => ({
      ...current,
      text: getInputText(inputNode.data),
      metadata: fieldValueAsString(inputNode.data.extras?.payloadJson) || "{}\n",
      fileAlias: fieldValueAsString(inputNode.data.extras?.attachedFileAlias),
      fileName: fieldValueAsString(inputNode.data.extras?.attachedFileName),
      fileMimeType: fieldValueAsString(inputNode.data.extras?.attachedFileMimeType),
      fileEncoding: fieldValueAsString(inputNode.data.extras?.attachedFileEncoding) || "base64",
      fileBase64: fieldValueAsString(inputNode.data.extras?.attachedFileBase64),
      fileContent: fieldValueAsString(inputNode.data.extras?.attachedFileContent),
    }));
  }, [inputNode?.id, inputNode?.data]);

  useEffect(() => {
    if (!selectedNode || selectedNode.type !== "agent") {
      setOllamaModelOptions([]);
      setIsLoadingOllamaModels(false);
      return;
    }

    if (!selectedAgentProviderDefinition?.supportsLocalModels || !selectedAgentProvider.startsWith("ollama")) {
      setOllamaModelOptions([]);
      setIsLoadingOllamaModels(false);
      return;
    }

    const targetNodeId = selectedNode.id;
    let cancelled = false;

    setIsLoadingOllamaModels(true);
    listOllamaModels(selectedAgentBaseUrl)
      .then((models) => {
        if (cancelled) {
          return;
        }
        setOllamaModelOptions(models);

        if (!models.length) {
          return;
        }

        setGraph((currentGraph) => {
          if (!currentGraph) {
            return currentGraph;
          }

          const targetNode = currentGraph.nodes.find((node) => node.id === targetNodeId && node.type === "agent");
          if (!targetNode) {
            return currentGraph;
          }

          const providerConfig = getProviderConfig(targetNode.data);
          const provider = normalizeProviderId(
            fieldValueAsString(targetNode.data.provider) || fieldValueAsString(providerConfig.provider_profile),
          );
          if (!provider.startsWith("ollama")) {
            return currentGraph;
          }

          const currentModel = fieldValueAsString(targetNode.data.model).trim();
          if (currentModel) {
            return currentGraph;
          }

          return {
            ...currentGraph,
            nodes: currentGraph.nodes.map((node) =>
              node.id === targetNodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      model: models[0],
                    },
                  }
                : node,
            ),
          };
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error(error);
        setOllamaModelOptions([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingOllamaModels(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedNode?.id, selectedAgentProvider, selectedAgentProviderDefinition, selectedAgentBaseUrl, ollamaModelsRefreshKey]);

  function isSectionOpen(sectionKey: string, defaultOpen = DEFAULT_SECTION_OPEN) {
    return openSections[sectionKey] ?? defaultOpen;
  }

  function toggleSection(sectionKey: string, defaultOpen = DEFAULT_SECTION_OPEN) {
    setOpenSections((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? defaultOpen),
    }));
  }

  function formatToolLibraryTitle(tool: BuiltInToolDefinition) {
    return `${tool.description}\n\nPrerequisite: ${tool.prerequisite ?? "Check the tool setup before running."}`;
  }

  function addNode(type: keyof typeof NODE_CATALOG) {
    if (!graph) {
      return;
    }

    const definition = NODE_CATALOG[type];
    const nodeId = createNodeId(graph, type);
    const nextIndex = graph.nodes.filter((node) => node.type === type).length + 1;

    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNodeId = createNodeId(currentGraph, type);
      const safeNextIndex = currentGraph.nodes.filter((node) => node.type === type).length + 1;

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type,
            position: createNodePosition(currentGraph),
            data: definition.createData(safeNextIndex),
          },
        ],
      };
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionMessage(`${definition.label} added to canvas.`);
    setActiveRightTab("properties");
  }

  function addBuiltInToolNode(tool: BuiltInToolDefinition) {
    if (!graph) {
      return;
    }

    const nodeId = createNodeId(graph, "tool");
    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNodeId = createNodeId(currentGraph, "tool");
      const nextIndex = currentGraph.nodes.filter((node) => node.type === "tool").length + 1;

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "tool",
            position: createNodePosition(currentGraph),
            data: createBuiltInToolData(tool, nextIndex),
          },
        ],
      };
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionMessage(`${tool.label} added to canvas.`);
    setActiveRightTab("properties");
  }

  function addMyToolNode(tool: SavedUserTool) {
    if (!graph) {
      return;
    }

    const nodeId = createNodeId(graph, "tool");
    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNodeId = createNodeId(currentGraph, "tool");

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "tool",
            position: createNodePosition(currentGraph),
            data: createSavedToolNodeData(tool),
          },
        ],
      };
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionMessage(`${tool.name} added to canvas.`);
    setActiveRightTab("properties");
  }

  function addStarterToolNode(tool: StarterToolTemplate) {
    if (!graph) {
      return;
    }

    const nodeId = createNodeId(graph, "tool");
    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const safeNodeId = createNodeId(currentGraph, "tool");

      return {
        ...currentGraph,
        nodes: [
          ...currentGraph.nodes,
          {
            id: safeNodeId,
            type: "tool",
            position: createNodePosition(currentGraph),
            data: createStarterToolNodeData(tool),
          },
        ],
      };
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionMessage(`${tool.name} added to canvas.`);
    setActiveRightTab("properties");
  }

  function renameMyTool(toolId: string) {
    const currentTool = myTools.find((tool) => tool.id === toolId);
    if (!currentTool) {
      return;
    }

    const nextName = window.prompt("Rename tool", currentTool.name)?.trim();
    if (!nextName || nextName === currentTool.name) {
      return;
    }

    setMyTools((currentTools) =>
      currentTools.map((tool) =>
        tool.id === toolId
          ? {
              ...tool,
              name: nextName,
            }
          : tool,
      ),
    );
    setConnectionMessage(`${currentTool.name} renamed to ${nextName}.`);
  }

  function deleteMyTool(toolId: string) {
    const currentTool = myTools.find((tool) => tool.id === toolId);
    if (!currentTool) {
      return;
    }

    const confirmed = window.confirm(`Delete "${currentTool.name}" from My Tools?`);
    if (!confirmed) {
      return;
    }

    setMyTools((currentTools) => currentTools.filter((tool) => tool.id !== toolId));
    setConnectionMessage(`${currentTool.name} removed from My Tools.`);
  }

  function saveCurrentFunctionTool() {
    if (!selectedNode || selectedNode.type !== "tool" || getToolMode(selectedNode.data) !== "function") {
      return;
    }

    const functionName = fieldValueAsString(selectedNode.data.extras?.functionName).trim();
    const functionCode = fieldValueAsString(selectedNode.data.extras?.functionCode).trim();
    const name = selectedNode.data.name.trim();

    if (!name || !functionName || !functionCode) {
      setConnectionMessage("Fill in name, function name, and code before saving to My Tools.");
      return;
    }

    const savedTool: SavedUserTool = {
      id: `my_tool_${Date.now()}`,
      name,
      description: selectedNode.data.description ?? "Custom function tool",
      functionName,
      functionCode,
      createdAt: new Date().toISOString(),
    };

    setMyTools((currentTools) => {
      const existingIndex = currentTools.findIndex((tool) => tool.name === savedTool.name);
      if (existingIndex >= 0) {
        const nextTools = [...currentTools];
        nextTools[existingIndex] = { ...savedTool, id: currentTools[existingIndex].id };
        return nextTools;
      }
      return [savedTool, ...currentTools];
    });
    setConnectionMessage(`${name} saved to My Tools.`);
  }

  function deleteSelectedNode() {
    if (!graph || !selectedNode) {
      return;
    }

    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      return {
        ...currentGraph,
        nodes: currentGraph.nodes.filter((node) => node.id !== selectedNode.id),
        edges: currentGraph.edges.filter(
          (edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id,
        ),
      };
    });
    if (editingFunctionNodeId === selectedNode.id) {
      setEditingFunctionNodeId(null);
    }
    if (pendingConnectionSourceId === selectedNode.id) {
      setPendingConnectionSourceId(null);
    }
    setConnectionMessage(`${selectedNode.data.name} removed from canvas.`);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }

  function deleteSelectedEdge() {
    if (!selectedEdgeId) {
      return;
    }

    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      return {
        ...currentGraph,
        edges: currentGraph.edges.filter((edge) => edge.id !== selectedEdgeId),
      };
    });
    setConnectionMessage("Connection removed from canvas.");
    setSelectedEdgeId(null);
  }

  function startConnection(nodeId: string) {
    const node = nodeMap[nodeId];
    if (!node) {
      return;
    }

    if (pendingConnectionSourceId === nodeId) {
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      setConnectionMessage("Connection canceled.");
      return;
    }

    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setPendingConnectionSourceId(nodeId);
    setConnectionPointer({
      x: node.position.x + NODE_WIDTH,
      y: node.position.y + NODE_MIN_HEIGHT / 2,
    });
    setConnectionMessage(`Source selected: ${node.data.name}. Now click the destination input port.`);
  }

  function finishConnection(targetId: string) {
    if (!graph || !pendingConnectionSourceId) {
      return;
    }

    const sourceNode = nodeMap[pendingConnectionSourceId];
    const targetNode = nodeMap[targetId];

    if (!sourceNode || !targetNode) {
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      return;
    }

    if (sourceNode.id === targetNode.id) {
      setConnectionMessage("A component cannot be connected to itself.");
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      return;
    }

    if (!canConnect(sourceNode.type, targetNode.type)) {
      setConnectionMessage(
        `${NODE_CATALOG[sourceNode.type].label} cannot connect to ${NODE_CATALOG[targetNode.type].label}.`,
      );
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      return;
    }

    const alreadyExists = graph.edges.some(
      (edge) => edge.source === sourceNode.id && edge.target === targetNode.id,
    );

    if (alreadyExists) {
      setConnectionMessage("This connection already exists.");
      setPendingConnectionSourceId(null);
      setConnectionPointer(null);
      return;
    }

    setGraph((currentGraph) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const edgeAlreadyExists = currentGraph.edges.some(
        (edge) => edge.source === sourceNode.id && edge.target === targetNode.id,
      );
      if (edgeAlreadyExists) {
        return currentGraph;
      }

      return {
        ...currentGraph,
        edges: [
          ...currentGraph.edges,
          {
            id: `edge_${sourceNode.id}_${targetNode.id}`,
            source: sourceNode.id,
            target: targetNode.id,
          },
        ],
      };
    });
    setPendingConnectionSourceId(null);
    setConnectionPointer(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(`edge_${sourceNode.id}_${targetNode.id}`);
    setConnectionMessage(`${sourceNode.data.name} connected to ${targetNode.data.name}.`);
  }

  function selectEdge(edge: GraphEdge) {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setPendingConnectionSourceId(null);
    setConnectionMessage(`Connection selected: ${nodeMap[edge.source]?.data.name ?? edge.source} -> ${nodeMap[edge.target]?.data.name ?? edge.target}.`);
    setActiveRightTab("properties");
  }

  async function handleRun() {
    if (!graph) {
      return;
    }

    setIsRunning(true);
    setRunError(null);
    setRunResult(null);

    try {
      const result = await runGraph(graph, credentials);
      setRunResult(result);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Unexpected runtime error.");
    } finally {
      setIsRunning(false);
    }
  }

  async function handleChatFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const fileBuffer = await file.arrayBuffer();
    const fileBase64 = arrayBufferToBase64(fileBuffer);
    setChatDraft((current) => ({
      ...current,
      fileName: file.name,
      fileAlias: current.fileAlias || file.name,
      fileMimeType: file.type || "text/plain",
      fileEncoding: "base64",
      fileBase64,
      fileContent: "",
    }));
  }

  function clearChatFile() {
    setChatDraft((current) => ({
      ...current,
      fileName: "",
      fileAlias: "",
      fileMimeType: "",
      fileEncoding: "base64",
      fileBase64: "",
      fileContent: "",
    }));
  }

  async function handleRunFromChat() {
    if (!graph) {
      return;
    }
    if (!inputNode) {
      setConnectionMessage("Add an Input node before using chat.");
      return;
    }

    if (chatDraft.metadata.trim() && !parseJsonObject(chatDraft.metadata)) {
      setConnectionMessage("Chat metadata must be a valid JSON object.");
      return;
    }

    if (inputMode !== "text" && !chatDraft.fileName) {
      setConnectionMessage("Current Input mode requires a file in chat upload.");
      return;
    }

    if (!canSendChatMessage) {
      setConnectionMessage("Provide a message or file before sending to the flow.");
      return;
    }

    const normalizedUserText = chatDraft.text.trim();
    const userText =
      inputMode === "file"
        ? normalizedUserText || (chatDraft.fileAlias || chatDraft.fileName || "Uploaded file")
        : normalizedUserText || "(empty message)";

    setChatMessages((current) => [
      ...current,
      {
        role: "user",
        text: userText,
        attachmentName: chatDraft.fileName || undefined,
      },
    ]);

    const preparedGraph = updateInputNodePayload(graph, chatDraft);
    setGraph(preparedGraph);
    setIsRunning(true);
    setRunError(null);
    setRunResult(null);

    try {
      const result = await runGraph(preparedGraph, credentials);
      setRunResult(result);
      const assistantText = extractAgentResponse(result.stdout) || result.stdout || (result.success ? "Execution completed." : result.stderr);
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: assistantText || "No response produced.",
        },
      ]);
      setChatDraft((current) => ({
        ...current,
        text: "",
      }));
      setActiveRightTab("code");
      setConnectionMessage("Flow executed from chat input.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected runtime error.";
      setRunError(message);
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: `Execution error: ${message}`,
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  }

  async function refreshSavedFlows() {
    try {
      const flows = await listFlows();
      setSavedFlows(flows);
    } catch (error) {
      console.error(error);
    }
  }

  function navigateToPath(path: string) {
    if (window.location.pathname === path) {
      return;
    }
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  }

  function handleOpenFlowFromHome(name: string) {
    const normalizedName = slugifyFlowName(name);
    if (!normalizedName) {
      return;
    }
    navigateToPath(buildFlowPath(normalizedName));
  }

  function handleCreateFlowFromHome() {
    navigateToPath(buildFlowPath("new"));
  }

  function handleGoHome() {
    navigateToPath("/");
  }

  async function handleSaveFlow() {
    if (!graph) {
      return;
    }

    const normalizedName = slugifyFlowName(flowName);
    if (!normalizedName) {
      setConnectionMessage("Provide a valid flow name before saving.");
      return;
    }

    setIsSavingFlow(true);
    try {
      await saveFlow(normalizedName, graph);
      setFlowName(normalizedName);
      window.history.replaceState({}, "", buildFlowPath(normalizedName));
      setCurrentPath(buildFlowPath(normalizedName));
      await refreshSavedFlows();
      setConnectionMessage(`Flow '${normalizedName}' saved successfully.`);
      setSavedFlowCurlModal({
        name: normalizedName,
        command: buildRunFlowCurlCommand(normalizedName),
      });
      setDidCopyCurl(false);
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : "Failed to save flow.");
    } finally {
      setIsSavingFlow(false);
    }
  }

  async function handleCopyCurlCommand() {
    if (!savedFlowCurlModal) {
      return;
    }

    try {
      await window.navigator.clipboard.writeText(savedFlowCurlModal.command);
      setDidCopyCurl(true);
    } catch (error) {
      console.error(error);
      setConnectionMessage("Failed to copy cURL command.");
    }
  }

  async function handleRunSavedFlowByName() {
    const normalizedName = slugifyFlowName(flowName);
    if (!normalizedName) {
      setConnectionMessage("Provide a valid flow name before running by name.");
      return;
    }

    const metadataPayload = parseJsonObject(runByNameMetadata);
    if (runByNameMetadata.trim() && !metadataPayload) {
      setConnectionMessage("Input metadata must be a valid JSON object.");
      return;
    }

    setIsRunningSavedFlow(true);
    setRunError(null);
    setRunResult(null);
    try {
      const result = await runFlowByName(normalizedName, runByNameInputText, metadataPayload, credentials);
      setRunResult(result);
      setConnectionMessage(`Saved flow '${normalizedName}' executed.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run saved flow.";
      setRunError(message);
      setConnectionMessage(message);
    } finally {
      setIsRunningSavedFlow(false);
    }
  }

  function handleExportPython() {
    const normalizedName = slugifyFlowName(flowName) || "agnolab_flow";
    downloadAsFile(code, `${normalizedName}.py`, "text/x-python;charset=utf-8");
    setConnectionMessage(`Generated code exported as ${normalizedName}.py`);
  }

  function handleOpenCurlModal(targetFlowName?: string) {
    const normalizedName = slugifyFlowName(targetFlowName ?? flowName);
    if (!normalizedName) {
      setConnectionMessage("Provide a valid flow name to generate cURL.");
      return;
    }

    setSavedFlowCurlModal({
      name: normalizedName,
      command: buildRunFlowCurlCommand(normalizedName),
    });
    setDidCopyCurl(false);
  }

  function handleNodeMouseDown(nodeId: string, event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const node = nodeMap[nodeId];
    if (!canvasRect || !node) {
      return;
    }

    setSelectedNodeId(nodeId);
    setDragState({
      nodeId,
      offsetX: event.clientX - canvasRect.left - node.position.x,
      offsetY: event.clientY - canvasRect.top - node.position.y,
    });
  }

  function handleCanvasPointerMove(event: ReactMouseEvent<HTMLElement>) {
    if (!pendingConnectionSourceId) {
      return;
    }

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) {
      return;
    }

    setConnectionPointer({
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top,
    });
  }

  function renderRequiredMark(field: { required?: boolean }) {
    if (!field.required) {
      return null;
    }
    return <span className="required-mark">*</span>;
  }

  function renderAgentField(field: AgentFieldDefinition) {
    if (!selectedNode) {
      return null;
    }

    const agentConfig = getAgentConfig(selectedNode.data);
    const providerConfig = getProviderConfig(selectedNode.data);
    const usesRootField = ["name", "description", "instructions", "provider", "model"].includes(field.key);
    const usesProviderField = [
      "provider_profile",
      "provider_api_key_env",
      "provider_api_key",
      "provider_base_url_env",
      "provider_base_url",
      "provider_execution_timeout_seconds",
      "provider_env_json",
    ].includes(field.key);
    const currentValue = usesRootField
      ? selectedNode.data[field.key as keyof NodeData]
      : usesProviderField
        ? providerConfig[field.key]
        : agentConfig[field.key];

    const label = (
      <>
        {field.label}
        {renderRequiredMark(field)}
      </>
    );

    if (field.type === "checkbox") {
      return (
        <label key={field.key} className="checkbox-field">
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={(event) => {
              const value = parseFieldValue(field, "", event.target.checked);
              if (usesRootField) {
                setGraph(updateNodeData(graph, selectedNode.id, { [field.key]: value } as Partial<NodeData>));
              } else if (usesProviderField) {
                setGraph(updateNodeData(graph, selectedNode.id, updateProviderConfig(selectedNode.data, field.key, value)));
              } else {
                setGraph(updateNodeData(graph, selectedNode.id, updateAgentConfig(selectedNode.data, field.key, value)));
              }
            }}
          />
          <span>{label}</span>
        </label>
      );
    }

    const sharedProps = {
      placeholder: field.placeholder,
      value: fieldValueAsString(currentValue),
      onChange: (
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => {
        const value = parseFieldValue(field, event.target.value, false);
        if (field.key === "provider_profile") {
          const presetId = fieldValueAsString(value);
          setGraph(updateNodeData(graph, selectedNode.id, applyProviderPreset(selectedNode.data, presetId)));
          return;
        }

        if (usesRootField) {
          setGraph(updateNodeData(graph, selectedNode.id, { [field.key]: value } as Partial<NodeData>));
        } else if (usesProviderField) {
          setGraph(updateNodeData(graph, selectedNode.id, updateProviderConfig(selectedNode.data, field.key, value)));
        } else {
          setGraph(updateNodeData(graph, selectedNode.id, updateAgentConfig(selectedNode.data, field.key, value)));
        }
      },
    };

    const isOllamaModelField = field.key === "model" && selectedAgentProvider.startsWith("ollama");

    if (isOllamaModelField) {
      const currentModel = fieldValueAsString(currentValue);
      const hasCurrentModelInOptions = ollamaModelOptions.includes(currentModel);

      return (
        <label key={field.key}>
          {label}
          <select
            value={currentModel}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { [field.key]: event.target.value } as Partial<NodeData>))
            }
          >
            {!currentModel ? <option value="">Select a local model</option> : null}
            {currentModel && !hasCurrentModelInOptions ? <option value={currentModel}>{currentModel} (current)</option> : null}
            {ollamaModelOptions.map((modelName) => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </select>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setOllamaModelsRefreshKey((current) => current + 1)}
              disabled={isLoadingOllamaModels}
            >
              {isLoadingOllamaModels ? "Refreshing models..." : "Refresh local models"}
            </button>
          </div>
          <p className="muted small-note">
            {isLoadingOllamaModels
              ? "Loading local Ollama models..."
              : ollamaModelOptions.length
                ? `Loaded ${ollamaModelOptions.length} model(s) from local Ollama.`
                : "No local models found or Ollama is unavailable."}
          </p>
        </label>
      );
    }

    return (
      <label key={field.key}>
        {label}
        {field.type === "textarea" || field.type === "json" || field.type === "python" ? (
          <textarea {...sharedProps} className={field.type !== "textarea" ? "code-input" : undefined} />
        ) : field.type === "select" ? (
          <select {...sharedProps}>
            <option value="">Not set</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              {...sharedProps}
              type={field.type === "number" ? "number" : "text"}
              list={
                field.key === "provider"
                  ? "agno-provider-options"
                  : field.key === "model" && selectedAgentProvider.startsWith("ollama")
                    ? "ollama-model-options"
                    : undefined
              }
            />
            {field.key === "provider" ? (
              <datalist id="agno-provider-options">
                {AGNO_MODEL_PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider} value={provider} />
                ))}
              </datalist>
            ) : null}
            {field.key === "model" && selectedAgentProvider.startsWith("ollama") ? (
              <>
                <datalist id="ollama-model-options">
                  {ollamaModelOptions.map((modelName) => (
                    <option key={modelName} value={modelName} />
                  ))}
                </datalist>
                <p className="muted small-note">
                  {isLoadingOllamaModels
                    ? "Loading local Ollama models..."
                    : ollamaModelOptions.length
                      ? "Suggestions loaded from your local Ollama instance."
                      : "No local models found or Ollama is unavailable."}
                </p>
              </>
            ) : null}
          </>
        )}
      </label>
    );
  }

  function renderSelectedNodeProperties() {
    if (!selectedNode) {
      return <p className="muted">Select a node in the canvas to edit its properties.</p>;
    }

    if (selectedNode.type === "input") {
      const currentNode = selectedNode;
      const inputMode = getInputMode(currentNode.data);
      const attachedFileName = getAttachedFileName(currentNode.data);
      const attachedFileMimeType = fieldValueAsString(currentNode.data.extras?.attachedFileMimeType);

      async function handleInputFileChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file || !graph) {
          return;
        }

        const fileBuffer = await file.arrayBuffer();
        const fileBase64 = arrayBufferToBase64(fileBuffer);
        setGraph(
          updateNodeData(graph, currentNode.id, {
            extras: {
              ...(currentNode.data.extras ?? {}),
              attachedFileName: file.name,
              attachedFileAlias: fieldValueAsString(currentNode.data.extras?.attachedFileAlias) || file.name,
              attachedFileMimeType: file.type || "text/plain",
              attachedFileEncoding: "base64",
              attachedFileBase64: fileBase64,
              attachedFileContent: "",
            },
          }),
        );
      }

      return (
        <>
          <label>
            Name
            <span className="required-mark">*</span>
            <input
              value={selectedNode.data.name}
              onChange={(event) =>
                setGraph(updateNodeData(graph, currentNode.id, { name: event.target.value }))
              }
            />
          </label>

          <label>
            Payload Mode
            <span className="required-mark">*</span>
            <select
              value={inputMode}
              onChange={(event) =>
                setGraph(
                  updateNodeData(graph, currentNode.id, {
                    extras: {
                      ...(currentNode.data.extras ?? {}),
                      inputMode: event.target.value,
                    },
                  }),
                )
              }
            >
              <option value="text">Text only</option>
              <option value="file">File only</option>
              <option value="mixed">Text + file</option>
            </select>
          </label>

          {inputMode !== "file" ? (
            <label>
              Text Payload
              <textarea
                value={getInputText(selectedNode.data)}
                onChange={(event) =>
                  setGraph(
                    updateNodeData(graph, currentNode.id, {
                      prompt: event.target.value,
                      extras: {
                        ...(currentNode.data.extras ?? {}),
                        inputText: event.target.value,
                      },
                    }),
                  )
                }
              />
            </label>
          ) : null}

          {inputMode !== "text" ? (
            <>
              <label>
                Upload File
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.json,.md,.xml,.yaml,.yml,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleInputFileChange}
                />
              </label>

              <label>
                File Alias
                <input
                  value={fieldValueAsString(selectedNode.data.extras?.attachedFileAlias)}
                  onChange={(event) =>
                    setGraph(
                      updateNodeData(graph, currentNode.id, {
                        extras: {
                          ...(currentNode.data.extras ?? {}),
                          attachedFileAlias: event.target.value,
                        },
                      }),
                    )
                  }
                />
              </label>

              {attachedFileName ? (
                <div className="info-note">
                  <p>
                    <strong>{attachedFileName}</strong>
                  </p>
                  <p>{attachedFileMimeType || "text/plain"}</p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setGraph(
                          updateNodeData(graph, currentNode.id, {
                            extras: {
                              ...(currentNode.data.extras ?? {}),
                              attachedFileName: "",
                              attachedFileAlias: "",
                              attachedFileMimeType: "",
                              attachedFileEncoding: "base64",
                              attachedFileBase64: "",
                              attachedFileContent: "",
                            },
                          }),
                        )
                      }
                    >
                      Clear File
                    </button>
                  </div>
                </div>
              ) : (
                <div className="info-note">
                  <p>Use upload to attach CSV, JSON, TXT, TSV, XLS, or XLSX files to the payload.</p>
                </div>
              )}
            </>
          ) : null}

          <label>
            Payload Metadata JSON
            <textarea
              className="code-input"
              value={fieldValueAsString(selectedNode.data.extras?.payloadJson)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(graph, currentNode.id, {
                    extras: {
                      ...(currentNode.data.extras ?? {}),
                      payloadJson: event.target.value,
                    },
                  }),
                )
              }
            />
          </label>

          <div className="info-note">
            <p>The codegen exposes `flow_input_payload`, `flow_input_files`, `flow_input_file_path`, and `flow_input` to tools, agents, and teams.</p>
          </div>
        </>
      );
    }

    if (selectedNode.type === "agent") {
      return (
        <>
          <div className="info-note">
            <p>Use a provider preset or enter a supported provider id. The generator uses the correct Agno provider class and falls back to the system environment when a key or URL is left blank.</p>
          </div>
          {AGENT_FIELD_GROUPS.map((group) => {
            const fields = AGENT_FIELDS.filter((field) => field.group === group);
            return (
              <section key={group} className="field-group">
                <h3>{group}</h3>
                {fields.map((field) => renderAgentField(field))}
              </section>
            );
          })}
        </>
      );
    }

    if (selectedNode.type === "tool") {
      const toolMode = getToolMode(selectedNode.data);
      const selectedBuiltInTool = getBuiltInTool(selectedNode.data.extras?.builtinToolKey as string | undefined);

      return (
        <>
          <label>
            Name
            <span className="required-mark">*</span>
            <input
              value={selectedNode.data.name}
              onChange={(event) =>
                setGraph(updateNodeData(graph, selectedNode.id, { name: event.target.value }))
              }
            />
          </label>

          <label>
            Tool Mode
            <span className="required-mark">*</span>
            <select
              value={toolMode}
              onChange={(event) => {
                const nextMode = event.target.value as "builtin" | "function";
                setGraph(
                  updateNodeData(
                    graph,
                    selectedNode.id,
                    updateToolConfig(selectedNode.data, { toolMode: nextMode }),
                  ),
                );
              }}
            >
              <option value="builtin">Built-in Tool</option>
              <option value="function">Function Tool</option>
            </select>
          </label>

          {toolMode === "builtin" ? (
            <>
              <label>
                Built-in Tool
                <span className="required-mark">*</span>
                <select
                  value={fieldValueAsString(selectedNode.data.extras?.builtinToolKey)}
                  onChange={(event) => {
                    const tool = getBuiltInTool(event.target.value);
                    if (!tool) {
                      return;
                    }
                    setGraph(
                      updateNodeData(graph, selectedNode.id, {
                        description: tool.description,
                        ...updateToolConfig(selectedNode.data, {
                          builtinToolKey: tool.key,
                          builtinImportPath: tool.importPath,
                          builtinClassName: tool.className,
                          builtinConfig: tool.configTemplate ?? "",
                        }),
                      }),
                    );
                  }}
                >
                  {BUILT_IN_TOOL_CATEGORIES.map((category) => (
                    <optgroup key={category} label={category}>
                      {BUILT_IN_TOOLS.filter((tool) => tool.category === category).map((tool) => (
                        <option key={tool.key} value={tool.key}>
                          {tool.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {selectedBuiltInTool ? (
                <div className="info-note">
                  <p>{selectedBuiltInTool.description}</p>
                  {selectedBuiltInTool.prerequisite ? <p>Prerequisite: {selectedBuiltInTool.prerequisite}</p> : null}
                </div>
              ) : null}

              <label>
                Tool Config JSON
                <textarea
                  className="code-input"
                  value={fieldValueAsString(selectedNode.data.extras?.builtinConfig)}
                  onChange={(event) =>
                    setGraph(
                      updateNodeData(
                        graph,
                        selectedNode.id,
                        updateToolConfig(selectedNode.data, { builtinConfig: event.target.value }),
                      ),
                    )
                  }
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Function Name
                <span className="required-mark">*</span>
                <input
                  value={fieldValueAsString(selectedNode.data.extras?.functionName)}
                  onChange={(event) =>
                    setGraph(
                      updateNodeData(
                        graph,
                        selectedNode.id,
                        updateToolConfig(selectedNode.data, { functionName: event.target.value }),
                      ),
                    )
                  }
                />
              </label>

              <div className="info-note">
                <p>Function tools use the Agno `@tool` decorator in codegen.</p>
              </div>

              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button code-button"
                  onClick={() => setEditingFunctionNodeId(selectedNode.id)}
                >
                  Open Code Editor
                </button>
                <button
                  type="button"
                  className="secondary-button save-button"
                  onClick={saveCurrentFunctionTool}
                >
                  Save Tool
                </button>
              </div>
            </>
          )}
        </>
      );
    }

    if (selectedNode.type === "output_api") {
      const currentNode = selectedNode;
      return (
        <>
          <label>
            Name
            <span className="required-mark">*</span>
            <input
              value={currentNode.data.name}
              onChange={(event) =>
                setGraph(updateNodeData(graph, currentNode.id, { name: event.target.value }))
              }
            />
          </label>

          <label>
            API URL
            <span className="required-mark">*</span>
            <input
              placeholder="https://api.example.com/webhooks/flow-result"
              value={fieldValueAsString(currentNode.data.extras?.apiUrl)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(graph, currentNode.id, {
                    extras: {
                      ...(currentNode.data.extras ?? {}),
                      apiUrl: event.target.value,
                    },
                  }),
                )
              }
            />
          </label>

          <label>
            Bearer Token
            <input
              placeholder="token without 'Bearer' prefix"
              value={fieldValueAsString(currentNode.data.extras?.apiBearerToken)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(graph, currentNode.id, {
                    extras: {
                      ...(currentNode.data.extras ?? {}),
                      apiBearerToken: event.target.value,
                    },
                  }),
                )
              }
            />
          </label>

          <label>
            Timeout (seconds)
            <input
              type="number"
              min={1}
              step={1}
              value={fieldValueAsString(currentNode.data.extras?.apiTimeoutSeconds || 15)}
              onChange={(event) => {
                const rawValue = Number(event.target.value);
                const nextValue = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 15;
                setGraph(
                  updateNodeData(graph, currentNode.id, {
                    extras: {
                      ...(currentNode.data.extras ?? {}),
                      apiTimeoutSeconds: nextValue,
                    },
                  }),
                );
              }}
            />
          </label>

          <label>
            Additional Headers JSON
            <textarea
              className="code-input"
              value={fieldValueAsString(currentNode.data.extras?.apiHeadersJson)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(graph, currentNode.id, {
                    extras: {
                      ...(currentNode.data.extras ?? {}),
                      apiHeadersJson: event.target.value,
                    },
                  }),
                )
              }
            />
          </label>

          <label>
            Additional Payload JSON
            <textarea
              className="code-input"
              value={fieldValueAsString(currentNode.data.extras?.apiPayloadJson)}
              onChange={(event) =>
                setGraph(
                  updateNodeData(graph, currentNode.id, {
                    extras: {
                      ...(currentNode.data.extras ?? {}),
                      apiPayloadJson: event.target.value,
                    },
                  }),
                )
              }
            />
          </label>

          <div className="info-note">
            <p>
              This node sends a POST request with a standard JSON envelope containing <code>flow</code>, <code>timestamp</code>, <code>input</code>, and <code>result</code>.
            </p>
          </div>
        </>
      );
    }

    return (
      <>
        <label>
          Name
          <span className="required-mark">*</span>
          <input
            value={selectedNode.data.name}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { name: event.target.value }))
            }
          />
        </label>

        <label>
          Description
          <textarea
            value={selectedNode.data.description ?? ""}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { description: event.target.value }))
            }
          />
        </label>

        <label>
          Instructions
          <textarea
            value={selectedNode.data.instructions ?? ""}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { instructions: event.target.value }))
            }
          />
        </label>

        <label>
          Prompt
          <textarea
            value={selectedNode.data.prompt ?? ""}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { prompt: event.target.value }))
            }
          />
        </label>

        <label>
          Condition
          <textarea
            value={selectedNode.data.condition ?? ""}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { condition: event.target.value }))
            }
          />
        </label>

        <label>
          Output Format
          <input
            value={selectedNode.data.output_format ?? ""}
            onChange={(event) =>
              setGraph(updateNodeData(graph, selectedNode.id, { output_format: event.target.value }))
            }
          />
        </label>
      </>
    );
  }

  if (isHomeRoute) {
    return (
      <>
        <div className="loading home-screen">
          <div className="home-shell home-workspace">
            <aside className="home-sidebar panel">
              <p className="eyebrow">Templates</p>
              <h2>Flows</h2>
              <button type="button" className="home-sidebar-item active">Saved Flows</button>
              <button type="button" className="home-sidebar-item" disabled>
                Team Flows (soon)
              </button>
              <button type="button" className="home-sidebar-item" disabled>
                Private Flows (soon)
              </button>
            </aside>

            <section className="home-content panel">
              <div className="home-content-header">
                <div>
                  <p className="eyebrow">AgnoLab</p>
                  <h1>Flow Hub</h1>
                  <p className="muted">Open any flow by name, each one with its own path like /flow/flow_name.</p>
                </div>
                <div className="home-navbar-actions">
                  <button type="button" className="secondary-button" disabled>
                    Login (coming soon)
                  </button>
                  <button type="button" className="secondary-button" onClick={refreshSavedFlows}>
                    Refresh
                  </button>
                  <button type="button" className="primary-button" onClick={handleCreateFlowFromHome}>
                    New Flow
                  </button>
                </div>
              </div>

              {homeError ? <p className="status-error">{homeError}</p> : null}

              <div className="home-card-grid">
                {savedFlows.length ? (
                  savedFlows.map((flow) => (
                    <article key={flow.name} className="flow-template-card">
                      <p className="flow-template-meta">FLOW</p>
                      <h3>{flow.name}</h3>
                      <p className="muted">Path: {buildFlowPath(flow.name)}</p>
                      <p className="muted">Updated: {new Date(flow.updated_at).toLocaleString()}</p>
                      <div className="button-row flow-template-actions">
                        <button type="button" className="secondary-button" onClick={() => handleOpenFlowFromHome(flow.name)}>
                          Open
                        </button>
                        <button type="button" className="secondary-button" onClick={() => handleOpenCurlModal(flow.name)}>
                          cURL
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <article className="flow-template-card">
                    <p className="flow-template-meta">EMPTY</p>
                    <h3>No saved flows yet</h3>
                    <p className="muted">Create your first flow to get a dedicated URL and cURL entrypoint.</p>
                  </article>
                )}
              </div>
            </section>
            </div>
        </div>

        {savedFlowCurlModal ? (
          <div className="modal-backdrop" onClick={() => setSavedFlowCurlModal(null)}>
            <div className="code-modal curl-modal" onClick={(event) => event.stopPropagation()}>
              <div className="code-modal-header">
                <div>
                  <p className="eyebrow">Saved Flow</p>
                  <h2>cURL for {savedFlowCurlModal.name}</h2>
                </div>
                <div className="button-row">
                  <button type="button" className="secondary-button save-button" onClick={handleCopyCurlCommand}>
                    {didCopyCurl ? "Copied" : "Copy cURL"}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setSavedFlowCurlModal(null)}>
                    Close
                  </button>
                </div>
              </div>
              <p className="muted">Use this request to execute the saved flow by name via POST.</p>
              <pre>{savedFlowCurlModal.command}</pre>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (isLoadingRouteFlow || !graph) {
    return <div className="loading">Loading flow...</div>;
  }

  return (
    <div className="layout">
      <aside className="left-dock">
        <section className="dock-library panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Components</p>
              <h2>Library</h2>
            </div>
            <span className="dock-target">{graph.project.target}</span>
          </div>

          {NODE_CATEGORIES.map((category) => {
            const sectionKey = `nodes:${category}`;
            const sectionOpen = isSectionOpen(sectionKey);
            const definitions = Object.values(NODE_CATALOG).filter(
              (definition) => definition.category === category && definition.type !== "tool",
            );
            if (definitions.length === 0) {
              return null;
            }
            return (
              <div key={category} className="library-category">
                <button
                  type="button"
                  className="library-section-toggle"
                  onClick={() => toggleSection(sectionKey)}
                >
                  <div className="library-section-copy">
                    <h3>{category}</h3>
                  </div>
                  <span className="library-section-meta">
                    <span>{definitions.length}</span>
                    <span className={`library-chevron ${sectionOpen ? "" : "collapsed"}`}>⌄</span>
                  </span>
                </button>
                {sectionOpen ? (
                  <div className="library-grid">
                    {definitions.map((definition) => (
                      <button
                        key={definition.type}
                        type="button"
                        className="library-item"
                        onClick={() => addNode(definition.type)}
                        title={definition.description}
                      >
                        <span className="library-icon" style={{ color: definition.color }}>
                          <NodeIcon type={definition.type} />
                        </span>
                        <span className="library-label">{definition.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("starter-tools")}
            >
              <div className="library-section-copy">
                <h3>Starter Tools</h3>
              </div>
              <span className="library-section-meta">
                <span>{STARTER_TOOLS.length}</span>
                <span className={`library-chevron ${isSectionOpen("starter-tools") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("starter-tools") ? (
              <div className="library-grid">
                {STARTER_TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    className="library-item"
                    onClick={() => addStarterToolNode(tool)}
                    title={`${tool.description ?? tool.name}\n\nPrerequisite: ${tool.prerequisite ?? "Check tool setup before running."}`}
                  >
                    <span className="library-icon" style={{ color: NODE_CATALOG.tool.color }}>
                      <NodeIcon type="tool" />
                    </span>
                    <span className="library-label">{tool.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("function-tool")}
            >
              <div className="library-section-copy">
                <h3>Function Tool</h3>
              </div>
              <span className="library-section-meta">
                <span>1</span>
                <span className={`library-chevron ${isSectionOpen("function-tool") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("function-tool") ? (
              <div className="library-grid">
                <button
                  type="button"
                  className="library-item"
                  onClick={() => addNode("tool")}
                  title={NODE_CATALOG.tool.description}
                >
                  <span className="library-icon" style={{ color: NODE_CATALOG.tool.color }}>
                    <NodeIcon type="tool" />
                  </span>
                  <span className="library-label">{NODE_CATALOG.tool.label}</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("my-tools")}
            >
              <div className="library-section-copy">
                <h3>My Tools</h3>
              </div>
              <span className="library-section-meta">
                <span>{myTools.length}</span>
                <span className={`library-chevron ${isSectionOpen("my-tools") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("my-tools") && myTools.length ? (
              <div className="library-grid">
                {myTools.map((tool) => (
                  <div key={tool.id} className="library-item library-item-card" title={tool.description ?? tool.name}>
                    <button
                      type="button"
                      className="library-item-main"
                      onClick={() => addMyToolNode(tool)}
                    >
                      <span className="library-icon" style={{ color: NODE_CATALOG.tool.color }}>
                        <NodeIcon type="tool" />
                      </span>
                      <span className="library-label">{tool.name}</span>
                    </button>
                    <div className="library-item-actions">
                      <button
                        type="button"
                        className="mini-action-button"
                        onClick={() => renameMyTool(tool.id)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="mini-action-button danger"
                        onClick={() => deleteMyTool(tool.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : isSectionOpen("my-tools") ? (
              <p className="muted">Save a Function Tool to reuse it here.</p>
            ) : null}
          </div>

          <div className="library-category">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("agno-tools")}
            >
              <div className="library-section-copy">
                <h3>Agno Tools</h3>
              </div>
              <span className="library-section-meta">
                <span>{BUILT_IN_TOOLS.length}</span>
                <span className={`library-chevron ${isSectionOpen("agno-tools") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>

            {isSectionOpen("agno-tools")
              ? BUILT_IN_TOOL_CATEGORIES.map((category) => {
                  const sectionKey = `agno-tools:${category}`;
                  const sectionOpen = isSectionOpen(sectionKey);
                  const tools = BUILT_IN_TOOLS.filter((tool) => tool.category === category);

                  return (
                    <div key={category} className="library-subcategory">
                      <button
                        type="button"
                        className="library-subcategory-toggle"
                        onClick={() => toggleSection(sectionKey)}
                      >
                        <div className="library-section-copy">
                          <h4>{category}</h4>
                        </div>
                        <span className="library-section-meta">
                          <span>{tools.length}</span>
                          <span className={`library-chevron ${sectionOpen ? "" : "collapsed"}`}>⌄</span>
                        </span>
                      </button>
                      {sectionOpen ? (
                        <div className="library-grid">
                          {tools.map((tool) => (
                            <button
                              key={tool.key}
                              type="button"
                              className="library-item"
                              onClick={() => addBuiltInToolNode(tool)}
                              title={formatToolLibraryTitle(tool)}
                            >
                              <span className="library-icon" style={{ color: toolIconColor(tool) }}>
                                <ToolIcon toolKey={tool.key} category={tool.category} />
                              </span>
                              <span className="library-label">{tool.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              : null}
          </div>

          <div className="library-upcoming">
            <button
              type="button"
              className="library-section-toggle"
              onClick={() => toggleSection("upcoming")}
            >
              <div className="library-section-copy">
                <h3>Upcoming</h3>
              </div>
              <span className="library-section-meta">
                <span>4</span>
                <span className={`library-chevron ${isSectionOpen("upcoming") ? "" : "collapsed"}`}>⌄</span>
              </span>
            </button>
            {isSectionOpen("upcoming") ? (
              <p className="muted">Vector DB, Knowledge, MCP, Skills, Memory, and Triggers will be added as new categories in this same sidebar.</p>
            ) : null}
          </div>
        </section>
      </aside>

      <main
        className={`canvas ${dragState ? "is-dragging" : ""}`}
        ref={canvasRef}
        onMouseMove={handleCanvasPointerMove}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
            setPendingConnectionSourceId(null);
            setConnectionPointer(null);
          }
        }}
      >
        <div className="canvas-brand">
          <p className="eyebrow">AgnoLab</p>
          <h1>{graph.project.name}</h1>
          <p className="muted">Visual canvas for Agno</p>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={handleGoHome}>
              Home
            </button>
          </div>
        </div>


        <div className="run-cta">
          <button type="button" className="primary-button run-button" onClick={handleRun} disabled={isRunning || isRunningSavedFlow}>
            {isRunning ? "Running..." : "Run"}
          </button>
        </div>

        <div className="flow-actions">
          <input
            className="flow-name-input"
            value={flowName}
            onChange={(event) => setFlowName(event.target.value)}
            list="saved-flow-names"
            placeholder="flow_name"
          />
          <button type="button" className="secondary-button" onClick={handleSaveFlow} disabled={isSavingFlow}>
            {isSavingFlow ? "Saving..." : "Save Flow"}
          </button>
          <button type="button" className="secondary-button" onClick={handleExportPython}>
            Export .py
          </button>
          <button type="button" className="secondary-button" onClick={() => handleOpenCurlModal()}>
            cURL
          </button>
          <datalist id="saved-flow-names">
            {savedFlows.map((flow) => (
              <option key={flow.name} value={flow.name} />
            ))}
          </datalist>
        </div>

        <div className="canvas-hint">
          <p>
            {pendingSourceNode
              ? `Connecting ${pendingSourceNode.data.name}. Click the destination left port to complete.`
              : connectionMessage ?? "To connect components: click the source right port and then the destination left port."}
          </p>
        </div>

        <div className="canvas-grid" />
        <svg className="edges">
          {graph.edges.map((edge) => {
            const source = nodeMap[edge.source];
            const target = nodeMap[edge.target];
            if (!source || !target) {
              return null;
            }

            const sourceCenterX = source.position.x + NODE_WIDTH / 2;
            const sourceCenterY = source.position.y + NODE_MIN_HEIGHT / 2;
            const targetCenterX = target.position.x + NODE_WIDTH / 2;
            const targetCenterY = target.position.y + NODE_MIN_HEIGHT / 2;
            const horizontalGap = targetCenterX - sourceCenterX;

            let x1 = source.position.x + NODE_WIDTH;
            let y1 = sourceCenterY;
            let x2 = target.position.x;
            let y2 = targetCenterY;

            if (Math.abs(horizontalGap) < 180) {
              x1 = sourceCenterX;
              y1 = source.position.y + 80;
              x2 = targetCenterX;
              y2 = target.position.y;
            } else if (horizontalGap < 0) {
              x1 = source.position.x;
              x2 = target.position.x + NODE_WIDTH;
            }

            const cx1 = x1 + (x2 - x1) * 0.45;
            const cx2 = x1 + (x2 - x1) * 0.55;

            return (
              <g key={edge.id}>
                <path
                  d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                  className={`edge-path ${selectedEdgeId === edge.id ? "selected" : ""}`}
                />
                <path
                  d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                  className="edge-hit-area"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectEdge(edge);
                  }}
                />
              </g>
            );
          })}
          {pendingSourceNode && connectionPointer ? (
            <path
              d={`M ${pendingSourceNode.position.x + NODE_WIDTH} ${pendingSourceNode.position.y + NODE_MIN_HEIGHT / 2} C ${
                pendingSourceNode.position.x + NODE_WIDTH + (connectionPointer.x - (pendingSourceNode.position.x + NODE_WIDTH)) * 0.45
              } ${pendingSourceNode.position.y + NODE_MIN_HEIGHT / 2}, ${
                pendingSourceNode.position.x + NODE_WIDTH + (connectionPointer.x - (pendingSourceNode.position.x + NODE_WIDTH)) * 0.55
              } ${connectionPointer.y}, ${connectionPointer.x} ${connectionPointer.y}`}
              className="edge-path edge-path-pending"
            />
          ) : null}
        </svg>

        {graph.nodes.map((node) => {
          const visual = getNodeVisualIcon(node);
          const runBadge = nodeRunBadges[node.id];

          return (
            <div
              key={node.id}
              className={`canvas-node ${runBadge ? "has-run-status" : ""} ${selectedNodeId === node.id ? "selected" : ""} ${pendingConnectionSourceId === node.id ? "is-connecting" : ""} ${dragState?.nodeId === node.id ? "is-dragging" : ""}`}
              style={{
                left: `${node.position.x}px`,
                top: `${node.position.y}px`,
                borderColor: selectedNodeId === node.id ? visual.color : undefined,
              }}
              onClick={() => setSelectedNodeId(node.id)}
              onClickCapture={() => setSelectedEdgeId(null)}
              onDoubleClick={() => {
                if (node.type === "input") {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                  setIsChatOpen((current) => !current);
                  return;
                }

                if (node.type !== "output") {
                  return;
                }
                setSelectedNodeId(node.id);
                setActiveRightTab("code");
                setOutputResponseOnly((current) => !current);
              }}
              onMouseDown={(event) => handleNodeMouseDown(node.id, event)}
            >
              {NODE_CATALOG[node.type].receivesFrom.length > 0 ? (
                <button
                  type="button"
                  className="port port-left"
                  title={`Receives from: ${listNodeTypes(NODE_CATALOG[node.type].receivesFrom)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    finishConnection(node.id);
                  }}
                />
              ) : null}

              {NODE_CATALOG[node.type].sendsTo.length > 0 ? (
                <button
                  type="button"
                  className="port port-right"
                  title={`Sends to: ${listNodeTypes(NODE_CATALOG[node.type].sendsTo)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    startConnection(node.id);
                  }}
                />
              ) : null}

              {runBadge ? (
                <span
                  className={`node-run-badge ${
                    runBadge.variant === "running"
                      ? "is-running"
                      : runBadge.variant === "tool-completed"
                        ? "is-tool-completed"
                        : "is-completed"
                  }`}
                  title={runBadge.title}
                >
                  {runBadge.text}
                </span>
              ) : null}

              <div className="node-help">
                <button type="button" className="help-button" onClick={(event) => event.stopPropagation()}>
                  ?
                </button>
                <div className="help-tooltip">
                  <strong>{NODE_CATALOG[node.type].label}</strong>
                  <p>{NODE_CATALOG[node.type].description}</p>
                  <p>Receives from: {listNodeTypes(NODE_CATALOG[node.type].receivesFrom)}</p>
                  <p>Sends to: {listNodeTypes(NODE_CATALOG[node.type].sendsTo)}</p>
                </div>
              </div>

              <span className="node-icon" style={{ color: visual.color }}>
                {visual.icon}
              </span>
              <span className="node-type">{getCanvasNodeLabel(node.data, node.type)}</span>
              <strong>{node.data.name}</strong>
              <span className="node-meta">
                {node.type === "output" && outputResponseOnly
                  ? "Response only view"
                  : node.type === "output"
                    ? "Double-click for clean response"
                    : getCanvasNodeMeta(node)}
              </span>
            </div>
          );
        })}
      </main>

      <aside className="right-dock">
        <section className="dock-inspector panel">
          <div className="tab-bar">
            <button
              type="button"
              className={`tab-button ${activeRightTab === "properties" ? "active" : ""}`}
              onClick={() => setActiveRightTab("properties")}
            >
              Properties
            </button>
            <button
              type="button"
              className={`tab-button ${activeRightTab === "code" ? "active" : ""}`}
              onClick={() => setActiveRightTab("code")}
            >
              Code
            </button>
            <button
              type="button"
              className={`tab-button ${activeRightTab === "runtime" ? "active" : ""}`}
              onClick={() => setActiveRightTab("runtime")}
            >
              Runtime
            </button>
          </div>

          {activeRightTab === "properties" ? (
            <div className="tab-content">
              <section className="subpanel">
                <h2>Selected node</h2>
                {selectedNode ? (
                  <div className="button-row danger-row">
                    <button type="button" className="danger-button" onClick={deleteSelectedNode}>
                      Delete Component
                    </button>
                  </div>
                ) : null}
                {selectedEdge ? (
                  <>
                    <div className="info-note">
                      <p>
                        <strong>Edge</strong>
                      </p>
                      <p>
                        {nodeMap[selectedEdge.source]?.data.name ?? selectedEdge.source} {"->"}{" "}
                        {nodeMap[selectedEdge.target]?.data.name ?? selectedEdge.target}
                      </p>
                    </div>
                    <div className="button-row danger-row">
                      <button type="button" className="danger-button" onClick={deleteSelectedEdge}>
                        Delete Edge
                      </button>
                    </div>
                  </>
                ) : null}
                {renderSelectedNodeProperties()}
              </section>

              <section className="subpanel">
                <h2>Warnings</h2>
                {warnings.length ? warnings.map((warning) => <p key={warning}>{warning}</p>) : <p className="muted">No warnings.</p>}
              </section>
            </div>
          ) : activeRightTab === "code" ? (
            <div className="tab-content">
              <section className="subpanel">
                <h2>Generated Python</h2>
                <p className="muted">Attached file payloads are hidden here for readability. Runtime execution still receives the uploaded file.</p>
                <pre>{displayedCode}</pre>
              </section>

              <section className="subpanel run-panel">
                <h2>Run result</h2>
                <div className="run-by-name-panel">
                  <h3>Run saved flow by name (POST mode)</h3>
                  <label>
                    Flow name
                    <input
                      value={flowName}
                      onChange={(event) => setFlowName(event.target.value)}
                      list="saved-flow-names"
                      placeholder="flow_name"
                    />
                  </label>
                  <label>
                    Input text
                    <textarea
                      value={runByNameInputText}
                      onChange={(event) => setRunByNameInputText(event.target.value)}
                      placeholder="Optional runtime input text"
                    />
                  </label>
                  <label>
                    Input metadata JSON
                    <textarea
                      className="code-input"
                      value={runByNameMetadata}
                      onChange={(event) => setRunByNameMetadata(event.target.value)}
                      placeholder='{"tenant":"acme"}'
                    />
                  </label>
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleRunSavedFlowByName}
                      disabled={isRunningSavedFlow}
                    >
                      {isRunningSavedFlow ? "Running saved flow..." : "Run Saved Flow"}
                    </button>
                    <button type="button" className="secondary-button" onClick={refreshSavedFlows}>
                      Refresh Flows
                    </button>
                  </div>
                  <p className="muted">
                    Available flows: {savedFlows.length ? savedFlows.map((flow) => flow.name).join(", ") : "none"}
                  </p>
                </div>
                {runError ? (
                  <div className="error-note">
                    <p>
                      <strong>Runtime error</strong>
                    </p>
                    <pre>{runError}</pre>
                  </div>
                ) : null}
                {runResult ? (
                  <>
                    <p className={runResult.success ? "status-ok" : "status-error"}>
                      {runResult.success ? "Execution succeeded." : "Execution failed."}
                    </p>
                    {runResult.stdout ? (
                      <>
                        <h3>{outputResponseOnly ? "agent response" : "stdout"}</h3>
                        <pre className="result-block">
                          {displayedStdout || (outputResponseOnly ? "No agent response found outside debug logs." : "")}
                        </pre>
                      </>
                    ) : null}
                    {runResult.stderr ? (
                      <div className="error-note">
                        <p>
                          <strong>stderr traceback</strong>
                        </p>
                        <pre>{runResult.stderr}</pre>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="muted">Run the flow to inspect stdout and stderr.</p>
                )}
              </section>
            </div>
          ) : (
            <div className="tab-content">
              <section className="subpanel">
                <h2>Runtime credentials</h2>
                <p className="muted">Used only for runtime requests. Not injected into generated code.</p>
                <label>
                  OpenAI API Key
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={credentials.openai_api_key ?? ""}
                    onChange={(event) =>
                      setCredentials({
                        ...credentials,
                        openai_api_key: event.target.value,
                      })
                    }
                  />
                </label>
              </section>
            </div>
          )}
        </section>
      </aside>

      {savedFlowCurlModal ? (
        <div className="modal-backdrop" onClick={() => setSavedFlowCurlModal(null)}>
          <div className="code-modal curl-modal" onClick={(event) => event.stopPropagation()}>
            <div className="code-modal-header">
              <div>
                <p className="eyebrow">Saved Flow</p>
                <h2>cURL for {savedFlowCurlModal.name}</h2>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button save-button" onClick={handleCopyCurlCommand}>
                  {didCopyCurl ? "Copied" : "Copy cURL"}
                </button>
                <button type="button" className="secondary-button" onClick={() => setSavedFlowCurlModal(null)}>
                  Close
                </button>
              </div>
            </div>
            <p className="muted">Use this request to execute the saved flow by name via POST.</p>
            <pre>{savedFlowCurlModal.command}</pre>
          </div>
        </div>
      ) : null}

      {editingFunctionNode ? (
        <div className="modal-backdrop" onClick={() => setEditingFunctionNodeId(null)}>
          <div className="code-modal" onClick={(event) => event.stopPropagation()}>
            <div className="code-modal-header">
              <div>
                <p className="eyebrow">Function Tool</p>
                <h2>{editingFunctionNode.data.name}</h2>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button save-button" onClick={saveCurrentFunctionTool}>
                  Save Tool
                </button>
                <button type="button" className="secondary-button" onClick={() => setEditingFunctionNodeId(null)}>
                  Close
                </button>
              </div>
            </div>

            <MonacoToolEditor
              value={fieldValueAsString(editingFunctionNode.data.extras?.functionCode)}
              onChange={(nextValue) =>
                setGraph(
                  updateNodeData(
                    graph,
                    editingFunctionNode.id,
                    updateToolConfig(editingFunctionNode.data, { functionCode: nextValue }),
                  ),
                )
              }
            />
          </div>
        </div>
      ) : null}

      {!isHomeRoute && isChatOpen ? (
        <div className="modal-backdrop" onClick={() => setIsChatOpen(false)}>
          <div className="code-modal chat-modal" onClick={(event) => event.stopPropagation()}>
            <header className="chat-topbar">
              <div>
                <p className="eyebrow">Flow playground</p>
                <h2>Flow Chat</h2>
              </div>
              <button type="button" className="secondary-button" onClick={() => setIsChatOpen(false)}>
                Close
              </button>
            </header>

            {inputNode ? (
              <div className="chat-shell">
                <div className="chat-history">
                  {chatMessages.length ? (
                    chatMessages.map((message, index) => (
                      <article key={`${message.role}-${index}`} className={`chat-bubble ${message.role === "user" ? "is-user" : "is-assistant"}`}>
                        <p>{message.text}</p>
                        {message.attachmentName ? <span className="chat-attachment-chip">📎 {message.attachmentName}</span> : null}
                      </article>
                    ))
                  ) : (
                    <div className="chat-empty-state">
                      <h3>Ready when you are.</h3>
                      <p className="muted">Send a message here to test your flow. Double-click the Input node to reopen this chat later.</p>
                    </div>
                  )}
                </div>

                <div className="chat-composer">
                  <input
                    ref={chatFileInputRef}
                    type="file"
                    className="chat-file-input"
                    accept=".csv,.tsv,.txt,.json,.md,.xml,.yaml,.yml,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleChatFileChange}
                  />

                  {chatDraft.fileName ? (
                    <div className="chat-upload-row">
                      <span className="chat-attachment-chip">📎 {chatDraft.fileAlias || chatDraft.fileName}</span>
                      <button type="button" className="secondary-button" onClick={clearChatFile}>
                        Remove
                      </button>
                      <input
                        className="chat-alias-input"
                        placeholder="File alias"
                        value={chatDraft.fileAlias}
                        onChange={(event) =>
                          setChatDraft((current) => ({
                            ...current,
                            fileAlias: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ) : null}

                  <div className={`chat-prompt-shell ${inputMode === "file" ? "file-only" : ""}`}>
                    {inputMode !== "text" ? (
                      <button
                        type="button"
                        className="secondary-button chat-upload-button"
                        onClick={() => chatFileInputRef.current?.click()}
                      >
                        +
                      </button>
                    ) : null}

                    {inputMode !== "file" ? (
                      <textarea
                        className="chat-input"
                        value={chatDraft.text}
                        onChange={(event) => setChatDraft((current) => ({ ...current, text: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            handleRunFromChat().catch(console.error);
                          }
                        }}
                        placeholder="Ask anything"
                      />
                    ) : (
                      <p className="muted chat-file-mode-copy">File mode active. Upload a file and click Send.</p>
                    )}

                    <button
                      type="button"
                      className="primary-button chat-send-button"
                      onClick={handleRunFromChat}
                      disabled={isRunning || isRunningSavedFlow || !canSendChatMessage}
                    >
                      {isRunning ? "..." : "Send"}
                    </button>
                  </div>

                  <div className="chat-composer-footer">
                    <span className="muted small-note">
                      Input mode: {inputMode === "text" ? "Text only" : inputMode === "file" ? "File only" : "Text + file"}
                    </span>

                    <details className="chat-advanced">
                      <summary>Metadata JSON</summary>
                      <textarea
                        className="code-input"
                        value={chatDraft.metadata}
                        onChange={(event) => setChatDraft((current) => ({ ...current, metadata: event.target.value }))}
                      />
                    </details>
                  </div>
                </div>
              </div>
            ) : (
              <p className="status-error">No Input node found in this flow.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
