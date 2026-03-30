from __future__ import annotations

import contextlib
import importlib
import io
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


AGNO_TOOL_IMPORT_RE = re.compile(r"^\s*from\s+(agno\.tools\.[\w_]+)\s+import\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)
AGNO_PROVIDER_IMPORT_RE = re.compile(
    r"^\s*from\s+(agno\.models\.[\w_.]+)\s+import\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?",
    re.MULTILINE,
)


def format_missing_dependency(stderr: str) -> str | None:
    missing_package_hints = {
        "No module named 'wikipedia'": "WikipediaTools requires the `wikipedia` package. Install it with `pip install wikipedia` in `apps/api/.venv`.",
        "The `wikipedia` package is not installed. Please install it via `pip install wikipedia`.": "WikipediaTools requires the `wikipedia` package. Install it with `pip install wikipedia` in `apps/api/.venv`.",
    }

    for marker, message in missing_package_hints.items():
        if marker in stderr:
            return f"{message}\n\n{stderr}"

    return None


def preflight_tool_imports(code: str) -> str | None:
    missing_messages: list[str] = []
    seen_modules: set[tuple[str, str]] = set()

    for module_path, class_name in AGNO_TOOL_IMPORT_RE.findall(code):
        key = (module_path, class_name)
        if key in seen_modules:
            continue
        seen_modules.add(key)

        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                importlib.import_module(module_path)
        except (ImportError, ModuleNotFoundError) as error:
            missing_messages.append(f"- {class_name}: {error}")

    if not missing_messages:
        return None

    return "Missing dependencies for selected Agno tools:\n" + "\n".join(missing_messages)


def preflight_provider_imports(code: str) -> str | None:
    missing_messages: list[str] = []
    seen_modules: set[tuple[str, str]] = set()

    for module_path, class_name, _alias in AGNO_PROVIDER_IMPORT_RE.findall(code):
        key = (module_path, class_name)
        if key in seen_modules:
            continue
        seen_modules.add(key)

        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                importlib.import_module(module_path)
        except (ImportError, ModuleNotFoundError) as error:
            missing_messages.append(f"- {class_name}: {error}")

    if not missing_messages:
        return None

    return "Missing dependencies for selected Agno providers:\n" + "\n".join(missing_messages)


def run_generated_code(
    code: str,
    *,
    openai_api_key: str | None = None,
    timeout_seconds: float = 20.0,
) -> tuple[bool, str, str, int | None]:
    effective_openai_key = openai_api_key or os.getenv("OPENAI_API_KEY")

    if timeout_seconds <= 0:
        timeout_seconds = 20.0

    missing_provider_dependencies = preflight_provider_imports(code)
    if missing_provider_dependencies:
        return False, "", missing_provider_dependencies, None

    missing_tool_dependencies = preflight_tool_imports(code)
    if missing_tool_dependencies:
        return False, "", missing_tool_dependencies, None

    with tempfile.TemporaryDirectory(prefix="agnolab-run-") as tmp_dir:
        script_path = Path(tmp_dir) / "main.py"
        script_path.write_text(code, encoding="utf-8")
        env = os.environ.copy()
        if effective_openai_key:
            env["OPENAI_API_KEY"] = effective_openai_key

        try:
            completed = subprocess.run(
                [sys.executable, str(script_path)],
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                cwd=tmp_dir,
                env=env,
            )
        except subprocess.TimeoutExpired:
            return False, "", f"Execution timed out after {timeout_seconds:g} seconds.", None

    success = completed.returncode == 0
    formatted_stderr = format_missing_dependency(completed.stderr) or completed.stderr
    return success, completed.stdout, formatted_stderr, completed.returncode
