// Pure graph transforms and node-layout helpers. Extracted from App.tsx.

import { NODE_CATALOG } from "./nodeCatalog";
import type { CanvasGraph, NodeData, Position } from "./types";

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

export function centerGraphInCanvas(graph: CanvasGraph, canvasWidth: number, canvasHeight: number): CanvasGraph {
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

export function cloneGraph(graph: CanvasGraph): CanvasGraph {
  return JSON.parse(JSON.stringify(graph)) as CanvasGraph;
}

export function organizeGraphNodes(graph: CanvasGraph): CanvasGraph {
  if (graph.nodes.length <= 1) {
    return graph;
  }

  const sortedNodes = [...graph.nodes].sort((left, right) => {
    if (left.position.y === right.position.y) {
      return left.position.x - right.position.x;
    }
    return left.position.y - right.position.y;
  });

  const columns = Math.max(1, Math.ceil(Math.sqrt(sortedNodes.length)));
  const startX = 180;
  const startY = 240;
  const xGap = 260;
  const yGap = 180;

  const nextPositionById = new Map<string, Position>();
  sortedNodes.forEach((node, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    nextPositionById.set(node.id, {
      x: startX + column * xGap,
      y: startY + row * yGap,
    });
  });

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: nextPositionById.get(node.id) ?? node.position,
    })),
  };
}
