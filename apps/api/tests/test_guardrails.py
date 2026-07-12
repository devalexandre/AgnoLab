"""Guardrails used via agent pre_hooks / post_hooks must resolve their imports.

Before this, typing a guardrail expression into pre_hooks/post_hooks compiled to
code that referenced an undefined name (NameError at runtime). Registering the
guardrail classes in RAW_EXPRESSION_IMPORTS makes them usable.
"""

from __future__ import annotations

import ast

from app.compiler import compile_graph
from app.sample_graph import build_base_graph


def _agent_with_hooks(field: str, expression: str):
    graph = build_base_graph()
    agent = next(n for n in graph.nodes if n.type.value == "agent")
    agent.data.extras.setdefault("agentConfig", {})[field] = expression
    return graph


def test_pre_hooks_guardrails_resolve_imports() -> None:
    graph = _agent_with_hooks("pre_hooks", "[PromptInjectionGuardrail(), PIIDetectionGuardrail()]")
    code, warnings = compile_graph(graph)
    ast.parse(code)
    assert "from agno.guardrails import PromptInjectionGuardrail" in code
    assert "from agno.guardrails import PIIDetectionGuardrail" in code
    assert "pre_hooks=[PromptInjectionGuardrail(), PIIDetectionGuardrail()]" in code
    assert warnings == []


def test_post_hooks_moderation_guardrail_resolves_import() -> None:
    graph = _agent_with_hooks("post_hooks", "[OpenAIModerationGuardrail()]")
    code, _warnings = compile_graph(graph)
    ast.parse(code)
    assert "from agno.guardrails import OpenAIModerationGuardrail" in code
    assert "post_hooks=[OpenAIModerationGuardrail()]" in code
