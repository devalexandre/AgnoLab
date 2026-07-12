"""Byte-exact snapshot tests for the compiler.

These pin the exact generated source for the canonical sample graphs (run and
serve modes). They are the safety net for refactoring the large compile_graph
function: any change that alters output for a sample fails here and must be an
intentional snapshot update (regenerate the files under tests/snapshots/).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.compiler import compile_graph
from app.sample_graph import (
    build_base_graph,
    build_rag_graph,
    build_team_graph,
    build_workflow_graph,
)

SNAPSHOT_DIR = Path(__file__).parent / "snapshots"

BUILDERS = {
    "base": build_base_graph,
    "team": build_team_graph,
    "workflow": build_workflow_graph,
    "rag": build_rag_graph,
}


@pytest.mark.parametrize("name", sorted(BUILDERS))
@pytest.mark.parametrize("mode", ["run", "serve"])
def test_compiler_output_matches_snapshot(name: str, mode: str) -> None:
    code, _warnings = compile_graph(BUILDERS[name](), serve=(mode == "serve"))
    snapshot_path = SNAPSHOT_DIR / f"{name}_{mode}.py.txt"
    expected = snapshot_path.read_text(encoding="utf-8")
    assert code == expected, (
        f"Generated code for '{name}' ({mode}) drifted from its snapshot. "
        f"If intentional, regenerate {snapshot_path.name}."
    )
