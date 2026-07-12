"""Golden / characterization tests for the graph -> Python compiler.

These pin the *current* behaviour of ``compile_graph`` so that the large
refactors planned for ``compiler.py`` (breaking up the 676-line ``compile_graph``)
can be done safely: any change that alters generated code for the canonical
sample graphs will fail here and must be reviewed on purpose.

The assertions are deliberately structural (valid Python + key invariants +
determinism) rather than full-string snapshots, which would be too brittle
against intentional formatting tweaks.
"""

from __future__ import annotations

import ast

import pytest

from app.compiler import compile_graph
from app.sample_graph import (
    build_base_graph,
    build_rag_graph,
    build_team_graph,
    build_workflow_graph,
)

SAMPLE_BUILDERS = {
    "base": build_base_graph,
    "team": build_team_graph,
    "workflow": build_workflow_graph,
    "rag": build_rag_graph,
}


@pytest.mark.parametrize("name", sorted(SAMPLE_BUILDERS))
def test_sample_graph_compiles_to_valid_python(name: str) -> None:
    code, _warnings = compile_graph(SAMPLE_BUILDERS[name]())
    # The single most important invariant: whatever we emit must parse.
    ast.parse(code)
    assert code.strip(), "compiler produced empty output"


@pytest.mark.parametrize("name", sorted(SAMPLE_BUILDERS))
def test_compilation_is_deterministic(name: str) -> None:
    graph = SAMPLE_BUILDERS[name]()
    first, _ = compile_graph(graph)
    second, _ = compile_graph(SAMPLE_BUILDERS[name]())
    assert first == second, "compiler output is not deterministic for the same graph"


def test_base_graph_emits_agent_and_imports() -> None:
    code, _ = compile_graph(build_base_graph())
    assert "from agno.agent import Agent" in code
    assert "Agent(" in code
    # Provider key must be read from the environment, not required at import time.
    assert "os.getenv('OPENAI_API_KEY')" in code


def test_team_graph_emits_team_with_members() -> None:
    code, _ = compile_graph(build_team_graph())
    assert "from agno.team import Team" in code
    assert "Team(" in code
    assert "members=" in code


def test_workflow_graph_emits_workflow_with_steps() -> None:
    code, _ = compile_graph(build_workflow_graph())
    assert "Workflow(" in code
    assert "steps=" in code


def test_rag_graph_emits_knowledge() -> None:
    code, _ = compile_graph(build_rag_graph())
    assert "Knowledge(" in code


def test_no_warnings_for_canonical_samples() -> None:
    # The shipped sample graphs should compile cleanly; a warning here means a
    # sample drifted out of sync with the compiler / installed Agno version.
    for name, builder in SAMPLE_BUILDERS.items():
        _, warnings = compile_graph(builder())
        assert warnings == [], f"sample '{name}' produced warnings: {warnings}"


def _inject_api_key(graph, secret: str) -> None:
    for node in graph.nodes:
        if node.type.value == "agent":
            provider_config = node.data.extras.setdefault("providerConfig", {})
            provider_config["provider_api_key"] = secret
            provider_config["provider_api_key_env"] = "OPENAI_API_KEY"
            return
    raise AssertionError("no agent node found to inject a key into")


@pytest.mark.xfail(
    reason="KNOWN SECURITY ISSUE: provider API keys are inlined as literals into "
    "generated code (compiler.py build_provider_env_setup / model constructor). "
    "Remove the xfail once codegen reads keys from the environment only.",
    strict=True,
)
def test_api_key_is_not_inlined_into_generated_code() -> None:
    secret = "sk-GOLDEN-SECRET-should-never-appear"
    graph = build_base_graph()
    _inject_api_key(graph, secret)
    code, _ = compile_graph(graph)
    assert secret not in code
