// Pure graph transforms and node-layout helpers. Extracted from App.tsx.

import { NODE_CATALOG } from "./nodeCatalog";
import type { CanvasGraph, GraphEdge, GraphNode, NodeData, Position } from "./types";

export const NODE_WIDTH = 180;
export const NODE_MIN_HEIGHT = 80;

export function updateNodeData(graph: CanvasGraph | null, nodeId: string, patch: Partial<NodeData>): CanvasGraph | null {
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

export function createNodeId(graph: CanvasGraph, type: keyof typeof NODE_CATALOG): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now()}_${graph.nodes.length + 1}`;

  return `${type}_${randomPart}`;
}

export function createNodePosition(graph: CanvasGraph): { x: number; y: number } {
  const baseX = 280;
  const baseY = 240;
  const perRow = 3;
  const index = graph.nodes.length;
  return {
    x: baseX + (index % perRow) * 230,
    y: baseY + Math.floor(index / perRow) * 170,
  };
}

export function cloneGraph(graph: CanvasGraph): CanvasGraph {
  return JSON.parse(JSON.stringify(graph)) as CanvasGraph;
}

const LAYOUT_COLUMN_GAP = 270;
/** Vertical space between stacked cards in a column. */
const LAYOUT_ROW_SPACING = 36;

/**
 * Layered left-to-right layout: each node's column is the length of the longest path that
 * reaches it, so data flows left to right; nodes in a column keep their current vertical order.
 * Cycles (not expected, but possible in a hand-built graph) fall back to the current order.
 */
export interface NodeSize {
  width: number;
  height: number;
}

export function layoutGraphLayered(
  graph: CanvasGraph,
  sizeOf: (nodeId: string) => NodeSize | undefined = () => undefined,
): CanvasGraph {
  if (graph.nodes.length <= 1) {
    return graph;
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const incoming = new Map<string, string[]>();
  graph.nodes.forEach((node) => incoming.set(node.id, []));
  graph.edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target) {
      incoming.get(edge.target)?.push(edge.source);
    }
  });

  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (id: string): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    const parents = incoming.get(id) ?? [];
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((parent) => rankOf(parent) + 1));
    visiting.delete(id);
    rank.set(id, value);
    return value;
  };
  graph.nodes.forEach((node) => rankOf(node.id));

  const columns = new Map<number, GraphNode[]>();
  graph.nodes.forEach((node) => {
    const column = rank.get(node.id) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), node]);
  });

  // Stack each column using real node heights (when known) so tall cards never overlap,
  // then center every column on the tallest one.
  const heightOf = (node: GraphNode) => sizeOf(node.id)?.height ?? NODE_MIN_HEIGHT + 40;
  const columnHeight = (nodes: GraphNode[]) =>
    nodes.reduce((total, node) => total + heightOf(node), 0) + Math.max(0, nodes.length - 1) * LAYOUT_ROW_SPACING;
  const tallestColumn = Math.max(...[...columns.values()].map(columnHeight));
  const originX = Math.min(...graph.nodes.map((node) => node.position.x));
  const originY = Math.min(...graph.nodes.map((node) => node.position.y));
  const next = new Map<string, Position>();
  [...columns.entries()].forEach(([column, nodes]) => {
    const ordered = [...nodes].sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x);
    let y = originY + (tallestColumn - columnHeight(ordered)) / 2;
    ordered.forEach((node) => {
      next.set(node.id, { x: originX + column * LAYOUT_COLUMN_GAP, y: Math.round(y) });
      y += heightOf(node) + LAYOUT_ROW_SPACING;
    });
  });

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node, position: next.get(node.id) ?? node.position })),
  };
}

/** A copied selection: the nodes plus only the edges between them. */
export interface GraphClipboard {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function copySubgraph(graph: CanvasGraph, nodeIds: Iterable<string>): GraphClipboard | null {
  const ids = new Set(nodeIds);
  const nodes = graph.nodes.filter((node) => ids.has(node.id));
  if (nodes.length === 0) {
    return null;
  }
  const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  return JSON.parse(JSON.stringify({ nodes, edges })) as GraphClipboard;
}

/**
 * Pastes a clipboard into the graph with fresh ids, offset so the copy does not cover the
 * original. Returns the new graph and the ids of the pasted nodes (to select them).
 */
export function pasteSubgraph(
  graph: CanvasGraph,
  clipboard: GraphClipboard,
  offset: Position = { x: 40, y: 40 },
): { graph: CanvasGraph; pastedIds: string[] } {
  const idMap = new Map<string, string>();
  const takenNames = new Set(graph.nodes.map((node) => node.data.name));
  const nodes = clipboard.nodes.map((node) => {
    const id = createNodeId(graph, node.type);
    idMap.set(node.id, id);
    let name = node.data.name;
    if (takenNames.has(name)) {
      let copyIndex = 1;
      while (takenNames.has(`${node.data.name} (copy${copyIndex > 1 ? ` ${copyIndex}` : ""})`)) copyIndex += 1;
      name = `${node.data.name} (copy${copyIndex > 1 ? ` ${copyIndex}` : ""})`;
    }
    takenNames.add(name);
    return {
      ...node,
      id,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      data: { ...JSON.parse(JSON.stringify(node.data)), name },
    } as GraphNode;
  });
  const edges = clipboard.edges.map((edge) => {
    const source = idMap.get(edge.source) ?? edge.source;
    const target = idMap.get(edge.target) ?? edge.target;
    return { ...edge, id: `edge_${source}_${target}${edge.target_handle ? `_${edge.target_handle}` : ""}`, source, target };
  });
  return {
    graph: { ...graph, nodes: [...graph.nodes, ...nodes], edges: [...graph.edges, ...edges] },
    pastedIds: nodes.map((node) => node.id),
  };
}

/** Removes nodes and every edge touching them, plus the given edges. */
export function removeFromGraph(graph: CanvasGraph, nodeIds: Iterable<string>, edgeIds: Iterable<string> = []): CanvasGraph {
  const nodes = new Set(nodeIds);
  const edges = new Set(edgeIds);
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => !nodes.has(node.id)),
    edges: graph.edges.filter((edge) => !edges.has(edge.id) && !nodes.has(edge.source) && !nodes.has(edge.target)),
  };
}
