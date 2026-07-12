"""Tests for the condition node: producer see-through + runtime gate.

Before this was implemented the condition node was uncompiled — placing one
between a producer and an output silently broke the flow (the output fell back
to the raw input). These tests pin the corrected behavior.
"""

from __future__ import annotations

import ast

from app.compiler import compile_graph, render_condition_gate
from app.models import GraphEdge, GraphNode, NodeData, Position
from app.sample_graph import build_base_graph


def _base_graph_with_condition(rule: str, *, extra_target: bool = False):
    graph = build_base_graph()
    agent = next(n for n in graph.nodes if n.type.value == "agent")
    output = next(n for n in graph.nodes if n.type.value in ("output", "output_api"))
    graph.edges = [e for e in graph.edges if not (e.source == agent.id and e.target == output.id)]

    condition = GraphNode(
        id="cond1",
        type="condition",
        position=Position(x=0, y=0),
        data=NodeData(name="Gate", condition=rule),
    )
    graph.nodes.append(condition)
    graph.edges.append(GraphEdge(id="e_a_c", source=agent.id, target=condition.id))
    graph.edges.append(GraphEdge(id="e_c_o", source=condition.id, target=output.id))
    if extra_target:
        graph.edges.append(GraphEdge(id="e_c_o2", source=condition.id, target=agent.id))
    return graph


def test_condition_compiles_and_sees_through_to_producer() -> None:
    code, warnings = compile_graph(_base_graph_with_condition("'ok' in resultado"))
    ast.parse(code)
    assert "_agnolab_run_with_debug(agent_" in code, "condition must run the real producer behind it"
    assert "resultado = flow_result_text" in code
    assert "_agnolab_condition_met" in code
    assert warnings == []


def test_multiple_downstream_targets_warns() -> None:
    _code, warnings = compile_graph(_base_graph_with_condition("True", extra_target=True))
    assert any("branching" in w.lower() for w in warnings)


def test_gate_keeps_result_when_rule_true() -> None:
    namespace = {"flow_result_text": "hello ok"}
    exec("\n".join(render_condition_gate("'ok' in resultado")), namespace)
    assert namespace["flow_result_text"] == "hello ok"


def test_gate_blanks_result_when_rule_false() -> None:
    namespace = {"flow_result_text": "nope"}
    exec("\n".join(render_condition_gate("'ok' in resultado")), namespace)
    assert namespace["flow_result_text"] == ""


def test_gate_survives_invalid_rule() -> None:
    namespace = {"flow_result_text": "x"}
    # An invalid rule must not raise; it is treated as "not met".
    exec("\n".join(render_condition_gate("undefined_var == 1")), namespace)
    assert namespace["flow_result_text"] == ""
