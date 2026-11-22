"""Saved flows created against Agno 2.x keep working after the Agno 3.x upgrade.

Agno 3.x removed `search_session_history` / `num_history_sessions` (replaced by the
`search_past_sessions` family) and the `reasoning*` flags. Old keys are aliased onto the new
kwargs; keys with no replacement produce an actionable warning instead of a silent drop.
"""

from __future__ import annotations

import ast

import pytest

from app.compiler import SUPPORTED_AGENT_KWARGS, compile_graph
from app.sample_graph import build_base_graph

pytestmark = pytest.mark.skipif(
    "search_session_history" in SUPPORTED_AGENT_KWARGS, reason="installed Agno still has the legacy kwargs"
)


def _agent_graph(**agent_config: object):
    graph = build_base_graph()
    agent = next(n for n in graph.nodes if n.type.value == "agent")
    agent.data.extras.setdefault("agentConfig", {}).update(agent_config)
    return graph


def test_legacy_session_history_keys_are_aliased() -> None:
    code, warnings = compile_graph(_agent_graph(search_session_history=True, num_history_sessions=4))

    ast.parse(code)
    assert "search_past_sessions=True" in code
    assert "num_past_sessions_to_search=4" in code
    assert "search_session_history" not in code
    assert not [w for w in warnings if "was ignored" in w], warnings


def test_direct_new_key_wins_over_legacy_alias_without_duplicate_kwarg() -> None:
    code, _ = compile_graph(_agent_graph(num_history_sessions=4, num_past_sessions_to_search=2))

    ast.parse(code)  # a duplicated kwarg would be a SyntaxError
    assert code.count("num_past_sessions_to_search=") == 1
    assert "num_past_sessions_to_search=2" in code


def test_removed_reasoning_flag_warns_with_a_hint() -> None:
    code, warnings = compile_graph(_agent_graph(reasoning=True))

    assert "reasoning=True" not in code
    assert any("'reasoning'" in w and "ReasoningTools" in w for w in warnings), warnings
