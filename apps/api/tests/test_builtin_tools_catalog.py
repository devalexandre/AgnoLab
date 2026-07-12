"""Guards for newly-added built-in tool catalog entries.

The tool catalog lives in the frontend, but the compiler emits an import +
instantiation from the (import_path, class_name) a tool node carries. These tests
verify that codegen is correct and that the import paths for dependency-free
toolkits actually resolve in the installed Agno (catching typos in a path).
"""

from __future__ import annotations

import ast
import importlib

import pytest

from app.compiler import compile_graph
from app.models import GraphEdge, GraphNode, NodeData, Position
from app.sample_graph import build_base_graph

# (import_path, class_name) for toolkits importable without extra third-party deps.
NO_DEP_TOOLKITS = [
    ("agno.tools.reasoning", "ReasoningTools"),
    ("agno.tools.knowledge", "KnowledgeTools"),
    ("agno.tools.user_control_flow", "UserControlFlowTools"),
    ("agno.tools.serper", "SerperTools"),
    ("agno.tools.searxng", "SearxngTools"),
    ("agno.tools.pubmed", "PubmedTools"),
    ("agno.tools.discord", "DiscordTools"),
]


def _agent_with_builtin_tool(import_path: str, class_name: str):
    graph = build_base_graph()
    agent = next(n for n in graph.nodes if n.type.value == "agent")
    tool = GraphNode(
        id="tool_new",
        type="tool",
        position=Position(),
        data=NodeData(
            name="ToolNew",
            extras={
                "toolKind": "builtin",
                "builtinImportPath": import_path,
                "builtinClassName": class_name,
            },
        ),
    )
    graph.nodes.append(tool)
    graph.edges.append(GraphEdge(id="e_tool_new", source=tool.id, target=agent.id))
    return graph


@pytest.mark.parametrize(("import_path", "class_name"), NO_DEP_TOOLKITS)
def test_builtin_tool_compiles_with_import(import_path: str, class_name: str) -> None:
    code, _warnings = compile_graph(_agent_with_builtin_tool(import_path, class_name))
    ast.parse(code)
    assert f"from {import_path} import {class_name}" in code
    assert f"{class_name}(" in code


@pytest.mark.parametrize(("import_path", "class_name"), NO_DEP_TOOLKITS)
def test_no_dep_toolkit_import_path_is_valid(import_path: str, class_name: str) -> None:
    # Guards against a typo in the catalog import path / class name.
    module = importlib.import_module(import_path)
    assert hasattr(module, class_name)
