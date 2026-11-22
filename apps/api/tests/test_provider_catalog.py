"""The provider catalog must match the installed Agno and stay in sync with the frontend.

Module/class existence is checked statically (no optional provider SDK needs to be installed).
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest

from app.provider_catalog import PROVIDER_DEFINITIONS

FRONTEND_CATALOG = Path(__file__).resolve().parents[2] / "web" / "src" / "providerCatalog.ts"


AGNO_ROOT = Path(importlib.util.find_spec("agno").origin).parent  # type: ignore[arg-type]


def _module_source(module: str) -> str | None:
    """Read a module's source by path, without importing it (or its optional SDK)."""
    parts = module.split(".")
    assert parts[0] == "agno", module
    base = AGNO_ROOT.joinpath(*parts[1:])
    for candidate in (base.with_suffix(".py"), base / "__init__.py"):
        if candidate.is_file():
            return candidate.read_text(encoding="utf-8")
    return None


@pytest.mark.parametrize("definition", PROVIDER_DEFINITIONS, ids=lambda definition: definition.id)
def test_provider_class_exists_in_installed_agno(definition) -> None:
    source = _module_source(definition.module)
    assert source is not None, f"{definition.id}: module {definition.module} not found"
    defined = re.search(rf"^class {re.escape(definition.class_name)}\b", source, re.MULTILINE)
    # Re-exports may span lines: `from x import (\n    Name,\n)` or `__all__ = ["Name"]`.
    reexported = re.search(rf"^\s*{re.escape(definition.class_name)},?\s*$|[\"']{re.escape(definition.class_name)}[\"']", source, re.MULTILINE)
    single_line = re.search(rf"\bimport\b[^\n]*\b{re.escape(definition.class_name)}\b", source)
    assert defined or reexported or single_line, f"{definition.id}: {definition.module} has no {definition.class_name}"


def test_frontend_and_backend_provider_ids_match() -> None:
    frontend_ids = set(re.findall(r'^\s{4}id: "([^"]+)"', FRONTEND_CATALOG.read_text(encoding="utf-8"), re.MULTILINE))
    backend_ids = {definition.id for definition in PROVIDER_DEFINITIONS}
    assert frontend_ids == backend_ids, {
        "only in frontend": sorted(frontend_ids - backend_ids),
        "only in backend": sorted(backend_ids - frontend_ids),
    }
