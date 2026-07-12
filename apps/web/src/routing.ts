// Flow URL routing and persisted-snapshot helpers. Extracted from App.tsx.

import type { CanvasGraph } from "./types";
import { slugifyFlowName } from "./utils";

export function getFlowNameFromPath(pathname: string): string | null {
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

export function buildFlowPath(flowName: string): string {
  return `/flow/${encodeURIComponent(flowName)}`;
}

export function getTemplateIdFromSearch(search: string): string | null {
  const templateId = new URLSearchParams(search).get("template")?.trim();
  return templateId ? templateId : null;
}

export function buildPersistedFlowSnapshot(flowName: string, graph: CanvasGraph | null): string {
  if (!graph) {
    return "";
  }
  const normalizedName = slugifyFlowName(flowName) || flowName.trim();
  return JSON.stringify({
    flowName: normalizedName,
    graph,
  });
}
