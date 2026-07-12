// Per-route flow draft persistence in localStorage. Extracted from App.tsx.

import { CanvasGraph } from "./types";

const FLOW_DRAFT_STORAGE_KEY_PREFIX = "agnolab.flow_draft.v1:";

export interface FlowDraftStorageRecord {
  flowName: string;
  graph: CanvasGraph;
  updatedAt: string;
}

export function buildFlowDraftRouteKey(routeFlowName: string | null, routeTemplateId: string | null): string | null {
  if (!routeFlowName) {
    return null;
  }
  if (routeFlowName === "new" && routeTemplateId) {
    return `new::template:${routeTemplateId}`;
  }
  return routeFlowName;
}

function buildFlowDraftStorageKey(routeKey: string): string {
  return `${FLOW_DRAFT_STORAGE_KEY_PREFIX}${routeKey}`;
}

function isCanvasGraph(value: unknown): value is CanvasGraph {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<CanvasGraph>;
  return Boolean(candidate.project) && Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}

export function loadFlowDraftFromStorage(routeKey: string | null): FlowDraftStorageRecord | null {
  if (!routeKey) {
    return null;
  }
  try {
    const rawValue = window.localStorage.getItem(buildFlowDraftStorageKey(routeKey));
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue) as Partial<FlowDraftStorageRecord>;
    if (!parsed || typeof parsed.flowName !== "string" || !isCanvasGraph(parsed.graph)) {
      return null;
    }
    return {
      flowName: parsed.flowName,
      graph: parsed.graph,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

export function saveFlowDraftToStorage(routeKey: string | null, draft: FlowDraftStorageRecord) {
  if (!routeKey) {
    return;
  }
  try {
    window.localStorage.setItem(buildFlowDraftStorageKey(routeKey), JSON.stringify(draft));
  } catch (error) {
    console.error(error);
  }
}

export function clearFlowDraftFromStorage(routeKey: string | null) {
  if (!routeKey) {
    return;
  }
  try {
    window.localStorage.removeItem(buildFlowDraftStorageKey(routeKey));
  } catch (error) {
    console.error(error);
  }
}
