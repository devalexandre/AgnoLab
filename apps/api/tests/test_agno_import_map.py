"""Every import the compiler can emit must exist in the installed Agno.

The check is static (module file + a definition/re-export of the name in its source) so it
does not need the optional SDKs (pinecone, boto3, ...) a real import would pull in. It caught
`agno.db.dynamodb` (real module: `agno.db.dynamo`) and a non-existent `agno.agent.AgentKnowledge`.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest

from app.compiler import INTERFACE_IMPORTS, KNOWLEDGE_READER_IMPORTS, RAW_EXPRESSION_IMPORTS

ALL_IMPORTS = sorted(
    {*RAW_EXPRESSION_IMPORTS.values(), *KNOWLEDGE_READER_IMPORTS.values(), *INTERFACE_IMPORTS.values()}
)


def module_source(module: str) -> str:
    spec = importlib.util.find_spec(module)
    assert spec is not None and spec.origin, f"module {module} not found in installed agno"
    return Path(spec.origin).read_text(encoding="utf-8")


@pytest.mark.parametrize(("module", "name"), ALL_IMPORTS, ids=[f"{m}.{n}" for m, n in ALL_IMPORTS])
def test_compiler_import_exists_in_installed_agno(module: str, name: str) -> None:
    source = module_source(module)
    defined = re.search(rf"^(class|def) {re.escape(name)}\b", source, re.MULTILINE)
    reexported = re.search(rf"\bimport\b[^\n]*\b{re.escape(name)}\b", source) or re.search(
        rf"^\s+{re.escape(name)},?\s*$", source, re.MULTILINE
    )
    assigned = re.search(rf"^{re.escape(name)}\s*=", source, re.MULTILINE)
    assert defined or reexported or assigned, f"{name} is not defined or re-exported by {module}"
