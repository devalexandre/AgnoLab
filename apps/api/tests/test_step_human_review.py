"""Agno 3.x moved a workflow step's human-in-the-loop kwargs into `Step(human_review=HumanReview(...))`.

These tests guard against the compiler silently dropping HITL settings (it filters kwargs the
installed Agno no longer accepts) and check the emitted HumanReview is accepted by a real Step.
"""

from __future__ import annotations

import re

import pytest

from app.compiler import STEP_USES_HUMAN_REVIEW, compile_graph
from app.models import NodeType
from app.sample_graph import build_workflow_graph, build_workflow_hitl_review_graph

pytestmark = pytest.mark.skipif(not STEP_USES_HUMAN_REVIEW, reason="installed Agno predates HumanReview")

HUMAN_REVIEW_CALL = re.compile(r"human_review=(HumanReview\(.*\)),$", re.MULTILINE)


def test_hitl_settings_are_emitted_as_human_review_without_warnings() -> None:
    code, warnings = compile_graph(build_workflow_hitl_review_graph())

    assert "from agno.workflow import HumanReview, Step, Workflow" in code
    assert not [w for w in warnings if "was ignored" in w], warnings
    assert "requires_confirmation=True" in code
    assert "on_reject='cancel'" in code
    assert "requires_user_input=True" in code
    # The legacy flat Step kwargs must not leak through on 3.x.
    assert not re.search(r"^\s+requires_confirmation=", code, re.MULTILINE)


def test_emitted_human_review_builds_a_real_step() -> None:
    from agno.workflow import HumanReview, Step

    code, _ = compile_graph(build_workflow_hitl_review_graph())
    calls = HUMAN_REVIEW_CALL.findall(code)
    assert calls, "expected at least one HumanReview(...) in the generated code"

    for index, call in enumerate(calls):
        review = eval(call, {"HumanReview": HumanReview})  # noqa: S307 - compiler output under test
        step = Step(name=f"step_{index}", executor=lambda step_input: None, human_review=review)
        assert step.human_review is review


def test_new_human_review_fields_are_compiled() -> None:
    graph = build_workflow_graph()
    step = next(node for node in graph.nodes if node.type == NodeType.WORKFLOW_STEP)
    step.data.extras = {
        **(step.data.extras or {}),
        "requiresOutputReview": True,
        "outputReviewMessage": "Check the draft",
        "reviewTimeout": 120,
        "onTimeout": "approve",
    }

    code, warnings = compile_graph(graph)

    assert not [w for w in warnings if "was ignored" in w], warnings
    assert "requires_output_review=True" in code
    assert "output_review_message='Check the draft'" in code
    assert "timeout=120" in code
    assert "on_timeout='approve'" in code


def test_steps_without_hitl_do_not_import_human_review() -> None:
    graph = build_workflow_graph()
    for node in graph.nodes:
        if node.type == NodeType.WORKFLOW_STEP:
            node.data.extras = {
                key: value
                for key, value in (node.data.extras or {}).items()
                if key not in {"requiresConfirmation", "onReject", "requiresUserInput", "onError"}
            }

    code, _ = compile_graph(graph)

    assert "from agno.workflow import Step, Workflow" in code
    assert "HumanReview" not in code


def test_on_timeout_is_only_emitted_with_a_timeout() -> None:
    graph = build_workflow_graph()
    step = next(node for node in graph.nodes if node.type == NodeType.WORKFLOW_STEP)
    step.data.extras = {**(step.data.extras or {}), "onTimeout": "cancel", "reviewTimeout": ""}

    code, _ = compile_graph(graph)

    assert "on_timeout" not in code
