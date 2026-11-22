"""Every built-in tool in the frontend catalog must exist in the installed Agno.

The catalog (apps/web/src/toolCatalog.ts) is hand-maintained; a wrong module path or class
name only surfaces when a user drops the tool on the canvas ("class not found"). This parses
the catalog and checks each (importPath, className) statically against Agno's source, so no
optional tool SDK needs to be installed.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest

CATALOG = Path(__file__).resolve().parents[2] / "web" / "src" / "toolCatalog.ts"
ENTRY = re.compile(r'importPath:\s*"(?P<module>[\w.]+)",\s*className:\s*"(?P<cls>\w+)"')


def catalog_entries() -> list[tuple[str, str]]:
    entries = [(m["module"], m["cls"]) for m in ENTRY.finditer(CATALOG.read_text(encoding="utf-8"))]
    assert entries, f"no tool entries parsed from {CATALOG}"
    return entries


def module_source(module: str) -> str | None:
    try:
        spec = importlib.util.find_spec(module)
    except ModuleNotFoundError:
        return None
    if spec is None or not spec.origin:
        return None
    return Path(spec.origin).read_text(encoding="utf-8")


@pytest.mark.parametrize(("module", "cls"), catalog_entries(), ids=lambda value: str(value))
def test_catalog_tool_exists_in_installed_agno(module: str, cls: str) -> None:
    source = module_source(module)
    assert source is not None, f"{module} does not exist in the installed Agno"
    defined = re.search(rf"^class {re.escape(cls)}\b", source, re.MULTILINE)
    reexported = re.search(rf"\bimport\b[^\n]*\b{re.escape(cls)}\b", source)
    assert defined or reexported, f"{module} has no class {cls}"


def test_legacy_tool_imports_resolve_to_existing_classes() -> None:
    from app.builtin_tools import LEGACY_BUILTIN_TOOL_IMPORTS

    for (old_module, old_cls), (module, cls) in LEGACY_BUILTIN_TOOL_IMPORTS.items():
        source = module_source(module)
        assert source is not None, f"{old_module}.{old_cls} -> {module} does not exist"
        assert re.search(rf"^class {re.escape(cls)}\b", source, re.MULTILINE), f"{module} has no class {cls}"


def test_saved_flow_with_legacy_google_tool_compiles_to_new_path() -> None:
    from app.compiler import compile_graph
    from app.sample_graph import build_base_graph

    graph = build_base_graph()
    tool = next(n for n in graph.nodes if n.type.value == "tool")
    tool.data.extras = {
        **(tool.data.extras or {}),
        "toolMode": "builtin",
        "builtinImportPath": "agno.tools.googlecalendar",
        "builtinClassName": "GoogleCalendarTools",
    }

    code, _ = compile_graph(graph)

    assert "from agno.tools.google.calendar import GoogleCalendarTools" in code
    assert "agno.tools.googlecalendar" not in code
