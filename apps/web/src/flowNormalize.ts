// Blank-graph creation, project-runtime normalization, and imported-flow validation.
// Extracted from App.tsx; pure functions over untrusted/imported data.

import { NODE_CATALOG } from "./nodeCatalog";
import type { CanvasGraph, GraphEdge, GraphNode, NodeData, NodeType, ProjectRuntimeConfig } from "./types";
import { fieldValueAsString, isObjectRecord, slugifyFlowName } from "./utils";

export function buildBlankGraph(): CanvasGraph {
  return {
    project: {
      name: "Blank Flow",
      target: "agno-python",
      runtime: {
        envVars: [],
        authEnabled: false,
        authToken: null,
      },
    },
    nodes: [],
    edges: [],
  };
}

export function createDefaultProjectRuntime(): ProjectRuntimeConfig {
  return {
    envVars: [],
    authEnabled: false,
    authToken: null,
  };
}

function normalizeProjectRuntime(value: unknown): ProjectRuntimeConfig {
  const runtime = isObjectRecord(value) ? value : {};
  const rawEnvVars = Array.isArray(runtime.envVars) ? runtime.envVars : [];

  return {
    envVars: rawEnvVars.map((item) => ({
      key: isObjectRecord(item) ? fieldValueAsString(item.key) : "",
      value: isObjectRecord(item) ? fieldValueAsString(item.value) : "",
    })),
    authEnabled: Boolean(runtime.authEnabled),
    authToken: runtime.authToken == null ? null : fieldValueAsString(runtime.authToken),
  };
}

export function getGraphProjectRuntime(graph: CanvasGraph | null): ProjectRuntimeConfig {
  return normalizeProjectRuntime(graph?.project?.runtime);
}

export function getGraphAuthToken(graph: CanvasGraph | null): string {
  const runtime = getGraphProjectRuntime(graph);
  return runtime.authEnabled ? fieldValueAsString(runtime.authToken).trim() : "";
}

export function createClientSecret(prefix: string): string {
  const rawToken =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${rawToken.slice(0, 24)}`;
}

function normalizeImportedNodeData(value: unknown, fallbackName: string): NodeData {
  const rawData = isObjectRecord(value) ? value : {};
  const temperatureValue =
    typeof rawData.temperature === "number"
      ? rawData.temperature
      : typeof rawData.temperature === "string"
        ? Number(rawData.temperature)
        : null;

  return {
    name: fieldValueAsString(rawData.name) || fallbackName,
    description: rawData.description == null ? null : fieldValueAsString(rawData.description),
    instructions: rawData.instructions == null ? null : fieldValueAsString(rawData.instructions),
    provider: rawData.provider == null ? null : fieldValueAsString(rawData.provider),
    model: rawData.model == null ? null : fieldValueAsString(rawData.model),
    temperature: Number.isFinite(temperatureValue) ? temperatureValue : null,
    tools: Array.isArray(rawData.tools) ? rawData.tools.map((item) => fieldValueAsString(item)).filter(Boolean) : [],
    prompt: rawData.prompt == null ? null : fieldValueAsString(rawData.prompt),
    condition: rawData.condition == null ? null : fieldValueAsString(rawData.condition),
    output_format: rawData.output_format == null ? null : fieldValueAsString(rawData.output_format),
    extras: isObjectRecord(rawData.extras) ? rawData.extras : {},
  };
}

export function normalizeImportedFlowPayload(rawValue: unknown): { graph: CanvasGraph; flowName: string } | null {
  const root = isObjectRecord(rawValue) ? rawValue : null;
  const graphCandidate = root && isObjectRecord(root.graph) ? root.graph : root;
  if (!graphCandidate || !isObjectRecord(graphCandidate)) {
    return null;
  }

  const rawNodes = Array.isArray(graphCandidate.nodes) ? graphCandidate.nodes : null;
  const rawEdges = Array.isArray(graphCandidate.edges) ? graphCandidate.edges : null;
  if (!rawNodes || !rawEdges) {
    return null;
  }

  const nodes: GraphNode[] = rawNodes.map((rawNode, index) => {
    if (!isObjectRecord(rawNode)) {
      throw new Error("Invalid node entry in imported flow.");
    }

    const type = fieldValueAsString(rawNode.type) as NodeType;
    if (!type || !(type in NODE_CATALOG)) {
      throw new Error(`Unsupported node type in imported flow: ${fieldValueAsString(rawNode.type) || "(empty)"}`);
    }

    const rawPosition = isObjectRecord(rawNode.position) ? rawNode.position : {};
    const positionX = typeof rawPosition.x === "number" ? rawPosition.x : Number(rawPosition.x ?? 0);
    const positionY = typeof rawPosition.y === "number" ? rawPosition.y : Number(rawPosition.y ?? 0);

    return {
      id: fieldValueAsString(rawNode.id) || `${type}_${index + 1}`,
      type,
      position: {
        x: Number.isFinite(positionX) ? positionX : 0,
        y: Number.isFinite(positionY) ? positionY : 0,
      },
      data: normalizeImportedNodeData(rawNode.data, `${NODE_CATALOG[type].label} ${index + 1}`),
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: GraphEdge[] = rawEdges.map((rawEdge, index) => {
    if (!isObjectRecord(rawEdge)) {
      throw new Error("Invalid edge entry in imported flow.");
    }

    const source = fieldValueAsString(rawEdge.source);
    const target = fieldValueAsString(rawEdge.target);
    if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) {
      throw new Error("Imported flow contains an edge with missing source or target nodes.");
    }

    return {
      id: fieldValueAsString(rawEdge.id) || `edge_${index + 1}`,
      source,
      target,
      source_handle: rawEdge.source_handle == null ? null : fieldValueAsString(rawEdge.source_handle),
      target_handle: rawEdge.target_handle == null ? null : fieldValueAsString(rawEdge.target_handle),
    };
  });

  const rawProject = isObjectRecord(graphCandidate.project) ? graphCandidate.project : {};
  const projectName =
    fieldValueAsString(rawProject.name) ||
    fieldValueAsString(root?.project_name) ||
    fieldValueAsString(root?.name) ||
    "Imported Flow";
  const targetValue = fieldValueAsString(rawProject.target);
  const graph: CanvasGraph = {
    project: {
      name: projectName,
      target: targetValue === "agnogo" ? "agnogo" : "agno-python",
      runtime: normalizeProjectRuntime(rawProject.runtime),
    },
    nodes,
    edges,
  };

  const flowName =
    slugifyFlowName(fieldValueAsString(root?.flow_name) || fieldValueAsString(root?.name) || projectName) ||
    "imported_flow";

  return { graph, flowName };
}
