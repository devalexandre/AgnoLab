"""Agno 3 agent/team options exposed in the inspector compile to kwargs Agno really accepts.

The serve-mode program is executed, which constructs the real Agent and AgentOS app, so a
renamed or rejected kwarg fails here instead of in a user's run.
"""

from __future__ import annotations

import ast
import os

from app.compiler import compile_graph
from app.sample_graph import build_base_graph


def _graph_with_agent_config(**config: object):
    graph = build_base_graph()
    agent = next(node for node in graph.nodes if node.type.value == "agent")
    agent.data.extras.setdefault("agentConfig", {}).update(config)
    return graph


def test_new_agent_options_compile_and_construct() -> None:
    graph = _graph_with_agent_config(
        fallback_models='["openai:gpt-4.1-nano"]',
        fallback_config='FallbackConfig(on_rate_limit=["openai:gpt-4.1-nano"])',
        compaction="Compaction(compact_at_tokens=60000)",
        checkpoint="runs",
        offload_tool_results=True,
    )
    code, warnings = compile_graph(graph, serve=True)
    ast.parse(code)
    assert not [w for w in warnings if "was ignored" in w], warnings
    assert "fallback_models=[\"openai:gpt-4.1-nano\"]" in code
    assert "compaction=Compaction(compact_at_tokens=60000)" in code
    assert "checkpoint='runs'" in code
    assert "from agno.compaction import Compaction" in code
    assert "from agno.models.fallback import FallbackConfig" in code

    os.environ.setdefault("OPENAI_API_KEY", "test-key")
    namespace: dict[str, object] = {"__name__": "agnolab_generated_app"}
    exec(compile(code, "main.py", "exec"), namespace)  # noqa: S102 - compiler output under test
    agent = next(value for value in namespace.values() if type(value).__name__ == "Agent")
    assert agent.compaction is not None  # type: ignore[attr-defined]
    assert agent.fallback_config.on_rate_limit  # type: ignore[attr-defined]
    assert any("uses Fallback Config and ignores Fallback Models" in w for w in warnings)


def test_fallback_models_alone_become_the_on_error_chain() -> None:
    code, warnings = compile_graph(_graph_with_agent_config(fallback_models='["openai:gpt-4.1-nano"]'), serve=True)
    assert not [w for w in warnings if "Fallback" in w]
    os.environ.setdefault("OPENAI_API_KEY", "test-key")
    namespace: dict[str, object] = {"__name__": "agnolab_generated_app"}
    exec(compile(code, "main.py", "exec"), namespace)  # noqa: S102 - compiler output under test
    agent = next(value for value in namespace.values() if type(value).__name__ == "Agent")
    assert agent.fallback_config.on_error  # type: ignore[attr-defined]


def test_compaction_true_shortcut() -> None:
    code, _ = compile_graph(_graph_with_agent_config(compaction="True"))
    assert "compaction=True" in code


def test_filesystem_option_compiles() -> None:
    # filesystem=True needs a database at construction time, so only the emitted kwarg is checked.
    code, warnings = compile_graph(_graph_with_agent_config(filesystem=True))
    assert "filesystem=True" in code
    assert not [w for w in warnings if "was ignored" in w], warnings
