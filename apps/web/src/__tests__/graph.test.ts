import { describe, expect, it } from "vitest";
import { copySubgraph, layoutGraphLayered, pasteSubgraph, removeFromGraph } from "../graph";
import type { CanvasGraph, GraphNode, NodeType } from "../types";

function node(id: string, type: NodeType, x: number, y: number, name = id): GraphNode {
  return { id, type, position: { x, y }, data: { name } };
}

function graphOf(nodes: GraphNode[], edges: Array<[string, string]>): CanvasGraph {
  return {
    project: { name: "test", target: "agno-python" },
    nodes,
    edges: edges.map(([source, target]) => ({ id: `edge_${source}_${target}`, source, target })),
  } as CanvasGraph;
}

const position = (graph: CanvasGraph, id: string) => graph.nodes.find((n) => n.id === id)!.position;

describe("layoutGraphLayered", () => {
  const graph = graphOf(
    [node("in", "input", 500, 500), node("tool", "tool", 0, 900), node("agent", "agent", 50, 50), node("out", "output", 10, 10)],
    [
      ["in", "agent"],
      ["tool", "agent"],
      ["agent", "out"],
    ],
  );

  it("places each node one column right of its deepest parent", () => {
    const laid = layoutGraphLayered(graph);
    expect(position(laid, "in").x).toBe(position(laid, "tool").x);
    expect(position(laid, "agent").x).toBeGreaterThan(position(laid, "in").x);
    expect(position(laid, "out").x).toBeGreaterThan(position(laid, "agent").x);
  });

  it("keeps the current vertical order inside a column", () => {
    const laid = layoutGraphLayered(graph);
    expect(position(laid, "in").y).toBeLessThan(position(laid, "tool").y);
  });

  it("uses measured heights so tall cards do not overlap", () => {
    const tall = { width: 190, height: 400 };
    const laid = layoutGraphLayered(graph, (id) => (id === "in" ? tall : { width: 190, height: 100 }));
    expect(position(laid, "tool").y).toBeGreaterThanOrEqual(position(laid, "in").y + tall.height);
  });

  it("survives a cycle", () => {
    const cyclic = graphOf([node("a", "agent", 0, 0), node("b", "agent", 0, 100)], [
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(() => layoutGraphLayered(cyclic)).not.toThrow();
  });
});

describe("copy / paste", () => {
  const graph = graphOf([node("a", "agent", 0, 0, "Writer"), node("b", "output", 300, 0), node("c", "tool", 0, 200)], [
    ["a", "b"],
    ["c", "a"],
  ]);

  it("copies only edges internal to the selection", () => {
    const clipboard = copySubgraph(graph, ["a", "b"])!;
    expect(clipboard.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(clipboard.edges.map((e) => e.id)).toEqual(["edge_a_b"]);
  });

  it("returns null for an empty selection", () => {
    expect(copySubgraph(graph, [])).toBeNull();
  });

  it("pastes with fresh ids, offset positions, renamed copies and rewired edges", () => {
    const { graph: pasted, pastedIds } = pasteSubgraph(graph, copySubgraph(graph, ["a", "b"])!);
    expect(pasted.nodes).toHaveLength(5);
    expect(pastedIds).toHaveLength(2);
    expect(pastedIds.some((id) => ["a", "b", "c"].includes(id))).toBe(false);
    const copyOfA = pasted.nodes.find((n) => n.id === pastedIds[0])!;
    expect(copyOfA.data.name).toBe("Writer (copy)");
    expect(copyOfA.position).toEqual({ x: 40, y: 40 });
    const newEdge = pasted.edges.find((e) => e.source === pastedIds[0]);
    expect(newEdge?.target).toBe(pastedIds[1]);
  });

  it("does not share data objects with the original", () => {
    const { graph: pasted, pastedIds } = pasteSubgraph(graph, copySubgraph(graph, ["a"])!);
    pasted.nodes.find((n) => n.id === pastedIds[0])!.data.name = "changed";
    expect(graph.nodes[0].data.name).toBe("Writer");
  });

  it("numbers repeated copies", () => {
    const once = pasteSubgraph(graph, copySubgraph(graph, ["a"])!).graph;
    const twice = pasteSubgraph(once, copySubgraph(graph, ["a"])!);
    expect(twice.graph.nodes.find((n) => n.id === twice.pastedIds[0])!.data.name).toBe("Writer (copy 2)");
  });
});

describe("removeFromGraph", () => {
  it("drops nodes, their edges, and explicitly removed edges", () => {
    const graph = graphOf([node("a", "agent", 0, 0), node("b", "output", 0, 0), node("c", "tool", 0, 0)], [
      ["a", "b"],
      ["c", "a"],
    ]);
    expect(removeFromGraph(graph, ["b"]).edges.map((e) => e.id)).toEqual(["edge_c_a"]);
    expect(removeFromGraph(graph, [], ["edge_c_a"]).edges.map((e) => e.id)).toEqual(["edge_a_b"]);
  });
});
