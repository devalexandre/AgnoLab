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
AGNO_COMPONENT_IMPORT_RE = re.compile(
    r"^\s*from\s+(agno\.(?:vectordb|db|knowledge|memory|session|compression|learn|skills)[\w_.]*)\s+import\s+([A-Za-z_][A-Za-z0-9_]*)",
    re.MULTILINE,
)


def format_missing_dependency(stderr: str) -> str | None:
    missing_package_hints = {
        "No module named 'wikipedia'": "WikipediaTools requires the `wikipedia` package. Install it with `pip install wikipedia` in `apps/api/.venv`.",
        "The `wikipedia` package is not installed. Please install it via `pip install wikipedia`.": "WikipediaTools requires the `wikipedia` package. Install it with `pip install wikipedia` in `apps/api/.venv`.",
        "The `qdrant-client` package is not installed.": "Qdrant requires the `qdrant-client` package. Install it with `pip install qdrant-client` in `apps/api/.venv`.",
        "The `chromadb` package is not installed.": "Chroma requires the `chromadb` package. Install it with `pip install chromadb` in `apps/api/.venv`.",
        "Weaviate is not installed.": "Weaviate requires the `weaviate-client` package. Install it with `pip install weaviate-client` in `apps/api/.venv`.",
        "`lancedb` not installed.": "LanceDB requires the `lancedb` package. Install it with `pip install lancedb` in `apps/api/.venv`.",
        "`pgvector` not installed.": "PgVector requires the `pgvector` package. Install it with `pip install pgvector` in `apps/api/.venv`.",
        "`pymongo` not installed.": "MongoDb requires the `pymongo` package. Install it with `pip install pymongo` in `apps/api/.venv`.",
        "`pypdf` not installed.": "PDF ingestion into Knowledge requires the `pypdf` package. Install it with `pip install pypdf` in `apps/api/.venv`.",
        "The `python-docx` package is not installed.": "Word ingestion into Knowledge requires the `python-docx` package. Install it with `pip install python-docx` in `apps/api/.venv`.",
        "The `python-pptx` package is not installed.": "PowerPoint ingestion into Knowledge requires the `python-pptx` package. Install it with `pip install python-pptx` in `apps/api/.venv`.",
        "`openpyxl` not installed.": "Excel `.xlsx` ingestion into Knowledge requires the `openpyxl` package. Install it with `pip install openpyxl` in `apps/api/.venv`.",
        "`xlrd` not installed.": "Excel `.xls` ingestion into Knowledge requires the `xlrd` package. Install it with `pip install xlrd` in `apps/api/.venv`.",
        "Please install it with `pip install aiofiles`": "Field-labeled CSV ingestion into Knowledge requires the `aiofiles` package. Install it with `pip install aiofiles` in `apps/api/.venv`.",
        "The `bs4` package is not installed.": "Website URL ingestion into Knowledge requires the `beautifulsoup4` package. Install it with `pip install beautifulsoup4` in `apps/api/.venv`.",
        "No module named 'yaml'": "Agno Skills validation requires the `pyyaml` package. Install it with `pip install pyyaml` in `apps/api/.venv`.",
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


def preflight_component_imports(code: str) -> str | None:
    missing_messages: list[str] = []
    seen_modules: set[tuple[str, str]] = set()

    for module_path, class_name in AGNO_COMPONENT_IMPORT_RE.findall(code):
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

    return "Missing dependencies for selected Agno components:\n" + "\n".join(missing_messages)


DEFAULT_TIMEOUT_SECONDS = 20.0


def _max_timeout_seconds() -> float:
    """Hard ceiling for any single run, regardless of per-flow settings.

    Without this a saved flow can request an arbitrarily large execution timeout
    and tie up a worker indefinitely (a trivial DoS).
    """
    try:
        value = float(os.getenv("AGNOLAB_MAX_EXECUTION_SECONDS", "300"))
    except ValueError:
        value = 300.0
    return value if value > 0 else 300.0


def _build_resource_limiter(timeout_seconds: float):
    """Return a POSIX ``preexec_fn`` that caps the child's resources, or None.

    CPU time and output file size are always capped (safe for legitimate flows).
    Address-space (memory) capping is opt-in via ``AGNOLAB_MAX_MEMORY_MB`` because
    ML / vector-store libraries legitimately reserve large virtual address ranges.
    """
    if os.name != "posix":
        return None

    try:
        import resource
    except ImportError:
        return None

    cpu_limit = int(timeout_seconds) + 5
    fsize_limit = int(os.getenv("AGNOLAB_MAX_OUTPUT_MB", "128")) * 1024 * 1024
    memory_mb = os.getenv("AGNOLAB_MAX_MEMORY_MB", "").strip()
    memory_limit = int(memory_mb) * 1024 * 1024 if memory_mb.isdigit() and int(memory_mb) > 0 else None

    def _limit() -> None:
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_limit, cpu_limit))
        resource.setrlimit(resource.RLIMIT_FSIZE, (fsize_limit, fsize_limit))
        if memory_limit is not None:
            resource.setrlimit(resource.RLIMIT_AS, (memory_limit, memory_limit))

    return _limit


def _terminate_process_tree(process: subprocess.Popen) -> None:
    """Kill the child's whole process group (POSIX) or fall back to the child."""
    if os.name == "posix":
        import signal

        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            return
        except (ProcessLookupError, PermissionError):
            pass
    process.kill()


def run_generated_code(
    code: str,
    *,
    extra_env: dict[str, str] | None = None,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> tuple[bool, str, str, int | None]:
    effective_openai_key = (extra_env or {}).get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY")

    if timeout_seconds <= 0:
        timeout_seconds = DEFAULT_TIMEOUT_SECONDS
    timeout_seconds = min(timeout_seconds, _max_timeout_seconds())

    missing_provider_dependencies = preflight_provider_imports(code)
    if missing_provider_dependencies:
        return False, "", missing_provider_dependencies, None

    missing_tool_dependencies = preflight_tool_imports(code)
    if missing_tool_dependencies:
        return False, "", missing_tool_dependencies, None

    missing_component_dependencies = preflight_component_imports(code)
    if missing_component_dependencies:
        return False, "", missing_component_dependencies, None

    with tempfile.TemporaryDirectory(prefix="agnolab-run-") as tmp_dir:
        script_path = Path(tmp_dir) / "main.py"
        script_path.write_text(code, encoding="utf-8")
        env = os.environ.copy()
        if extra_env:
            env.update(extra_env)
        if effective_openai_key:
            env["OPENAI_API_KEY"] = effective_openai_key

        # start_new_session=True puts the child in its own process group so that on
        # timeout we can kill the whole tree, not just the direct child.
        process = subprocess.Popen(
            [sys.executable, str(script_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=tmp_dir,
            env=env,
            start_new_session=True,
            preexec_fn=_build_resource_limiter(timeout_seconds),
        )
        try:
            stdout, stderr = process.communicate(timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            _terminate_process_tree(process)
            process.communicate()
            return False, "", f"Execution timed out after {timeout_seconds:g} seconds.", None

    success = process.returncode == 0
    formatted_stderr = format_missing_dependency(stderr) or stderr
    return success, stdout, formatted_stderr, process.returncode
