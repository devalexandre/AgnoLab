"""Workflow control-flow nodes compile to real Agno Parallel / Loop / Router / Condition.

The executable test runs the generated program end to end. Every step uses a Function Tool
executor, so no model or network is involved, and the printed result proves the routing,
looping and branching actually happened at runtime.
"""

from __future__ import annotations

import ast
import os
import subprocess
import sys
from pathlib import Path

from app.compiler import compile_graph
from app.models import CanvasGraph, GraphEdge, ProjectMeta
from app.sample_graph import (
    _input_node,
    _output_node,
    _tool_node,
    _workflow_control_node,
    _workflow_node,
    _workflow_step_node,
)


def _fn(name: str, body: str):
    return _tool_node(
        f"tool_{name}",
        x=0,
        y=0,
        name=name,
        description=name,
        function_name=name,
        # Print a marker so the test can see which steps actually ran.
        function_code=f"def {name}(value: str) -> str:\n    print('RAN={name}')\n    {body}\n",
    )


def _step(name: str, order: int):
    return _workflow_step_node(f"step_{name}", x=0, y=order * 100, name=name, description=name, order=order)


def control_graph(*, request: str, router_rule: str, branch_rule: str) -> CanvasGraph:
    nodes = [
        _input_node("input_1", x=0, y=0, name="In", text=request, source="test"),
        # Router choices
        _fn("billing", "return 'ROUTE=billing'"),
        _step("Billing", 1),
        _fn("support", "return 'ROUTE=support'"),
        _step("Support", 2),
        _workflow_control_node(
            "router_1", "workflow_router", x=0, y=0, name="Triage", description="", order=1, selector=router_rule
        ),
        # Parallel branches
        _fn("left", "return 'L'"),
        _step("Left", 1),
        _fn("right", "return 'R'"),
        _step("Right", 2),
        _workflow_control_node("parallel_1", "workflow_parallel", x=0, y=0, name="Fan out", description="", order=2),
        # Loop: the tool reports "done" on its third call; the end condition watches for it.
        _fn("tick", "calls = globals().setdefault('_tick_calls', [0])\n    calls[0] += 1\n    return 'done' if calls[0] >= 3 else 'tick'"),
        _step("Tick", 1),
        _workflow_control_node(
            "loop_1",
            "workflow_loop",
            x=0,
            y=0,
            name="Refine",
            description="",
            order=3,
            maxIterations=10,
            endCondition="'done' in last",
        ),
        # Branch with if / else
        _fn("yes", "return 'BRANCH=if'"),
        _step("Yes", 1),
        _fn("no", "return 'BRANCH=else'"),
        _step("No", 2),
        _workflow_control_node(
            "branch_1", "workflow_branch", x=0, y=0, name="Decide", description="", order=4, evaluator=branch_rule
        ),
        _workflow_node("workflow_1", x=0, y=0, name="Control", description="control flow"),
        _output_node("output_1", x=0, y=0, name="Out"),
    ]
    edges = [
        ("tool_billing", "step_Billing"),
        ("tool_support", "step_Support"),
        ("step_Billing", "router_1"),
        ("step_Support", "router_1"),
        ("tool_left", "step_Left"),
        ("tool_right", "step_Right"),
        ("step_Left", "parallel_1"),
        ("step_Right", "parallel_1"),
        ("tool_tick", "step_Tick"),
        ("step_Tick", "loop_1"),
        ("tool_yes", "step_Yes"),
        ("tool_no", "step_No"),
        ("step_Yes", "branch_1"),
        ("router_1", "workflow_1"),
        ("parallel_1", "workflow_1"),
        ("loop_1", "workflow_1"),
        ("branch_1", "workflow_1"),
        ("input_1", "workflow_1"),
        ("workflow_1", "output_1"),
    ]
    graph_edges = [GraphEdge(id=f"e_{s}_{t}", source=s, target=t) for s, t in edges]
    graph_edges.append(GraphEdge(id="e_no_else", source="step_No", target="branch_1", target_handle="else"))
    return CanvasGraph(project=ProjectMeta(name="Control"), nodes=nodes, edges=graph_edges)


def test_control_nodes_compile_to_agno_classes() -> None:
    code, warnings = compile_graph(
        control_graph(request="invoice", router_rule="'Billing' if 'invoice' in text else 'Support'", branch_rule="True")
    )
    ast.parse(code)
    assert "from agno.workflow import Condition, HumanReview, Loop, Parallel, Router, Step, Workflow" in code
    assert "Parallel(\n    workflow_step_step_left,\n    workflow_step_step_right," in code
    assert "max_iterations=10" in code
    assert "end_condition=workflow_loop_loop_1_end_condition" in code
    assert "else_steps=[workflow_step_step_no]" in code
    # Workflow steps keep their stepOrder: router, parallel, loop, branch.
    assert "steps=[workflow_router_router_1, workflow_parallel_parallel_1, workflow_loop_loop_1, workflow_branch_branch_1]" in code
    assert not [w for w in warnings if "Router" in w or "Loop" in w or "Branch" in w or "Parallel" in w], warnings


def test_invalid_rules_are_reported_not_emitted() -> None:
    code, warnings = compile_graph(control_graph(request="x", router_rule="'Billing' if", branch_rule="1 +"))
    ast.parse(code)
    assert any("Router 'Triage' selector is not a valid Python expression" in w for w in warnings)
    assert any("Branch 'Decide' rule is not a valid Python expression" in w for w in warnings)


def _run(graph: CanvasGraph, tmp_path: Path) -> str:
    code, _ = compile_graph(graph)
    script = tmp_path / "main.py"
    script.write_text(code, encoding="utf-8")
    env = {**os.environ, "AGNO_TELEMETRY": "false", "OPENAI_API_KEY": "unused"}
    result = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, timeout=120, env=env, cwd=tmp_path)
    assert result.returncode == 0, result.stderr[-3000:]
    return result.stdout


def test_generated_control_flow_runs(tmp_path: Path) -> None:
    out = _run(
        control_graph(
            request="please check my invoice",
            router_rule="'Billing' if 'invoice' in text else 'Support'",
            branch_rule="'invoice' in text",
        ),
        tmp_path,
    )
    assert "RAN=billing" in out and "RAN=support" not in out  # router picked one route
    assert "RAN=left" in out and "RAN=right" in out  # parallel ran both branches
    assert out.count("RAN=tick") == 3  # loop stopped by its end condition, not max_iterations
    assert "RAN=yes" in out and "RAN=no" not in out  # branch took the if path
    assert "BRANCH=if" in out  # the last step's output is the workflow result


def test_generated_control_flow_takes_other_paths(tmp_path: Path) -> None:
    out = _run(
        control_graph(
            request="my app crashes",
            router_rule="'Billing' if 'invoice' in text else 'Support'",
            branch_rule="'invoice' in text",
        ),
        tmp_path,
    )
    assert "RAN=support" in out and "RAN=billing" not in out
    assert "RAN=no" in out and "RAN=yes" not in out
    assert "BRANCH=else" in out


def test_control_flow_template_compiles_cleanly() -> None:
    from app.sample_graph import build_workflow_control_flow_graph, get_canvas_template

    assert get_canvas_template("workflow-control-flow") is not None
    code, warnings = compile_graph(build_workflow_control_flow_graph())
    ast.parse(code)
    assert warnings == [], warnings
    for name in ("Router(", "Parallel(", "Loop(", "Condition("):
        assert name in code
