"""The AgentOS 'serve' export target.

Instead of a run-once script, serve mode emits a FastAPI app that exposes the
graph's agents/teams/workflows via AgentOS. These tests verify the generated code
is valid, wires AgentOS correctly, and actually builds a FastAPI app when executed.
"""

from __future__ import annotations

import ast

from app.compiler import compile_graph
from app.exporter import export_project
from app.sample_graph import build_base_graph, build_team_graph


def test_serve_emits_agent_os_app() -> None:
    code, warnings = compile_graph(build_base_graph(), serve=True)
    ast.parse(code)
    assert "from agno.os import AgentOS" in code
    assert "agent_os = AgentOS(" in code
    assert "app = agent_os.get_app()" in code
    assert 'agent_os.serve(app="main:app"' in code
    assert warnings == []


def test_serve_skips_run_once_machinery() -> None:
    code, _ = compile_graph(build_base_graph(), serve=True)
    # None of the run-once helpers/markers should appear in a serve build.
    assert "_agnolab_run_with_debug" not in code
    assert "__AGNO_RESULT_START__" not in code


def test_team_graph_serves_the_team() -> None:
    code, _ = compile_graph(build_team_graph(), serve=True)
    assert "teams=[" in code


def test_serve_code_builds_a_fastapi_app_when_executed() -> None:
    # Strongest check: run the generated module (guarded __main__ prevents serve())
    # and confirm AgentOS produced a real FastAPI app from the graph's components.
    code, _ = compile_graph(build_team_graph(), serve=True)
    namespace: dict = {"__name__": "__agnolab_serve_test__"}
    exec(compile(code, "main.py", "exec"), namespace)
    app = namespace.get("app")
    assert app is not None
    assert app.__class__.__name__ == "FastAPI"


def test_export_serve_adds_server_deps_and_run_docs() -> None:
    response = export_project(build_base_graph(), serve=True)
    files = {f.path: f.content for f in response.files}
    assert "fastapi" in files["requirements.txt"]
    assert "uvicorn" in files["requirements.txt"]
    assert "AgentOS server app" in files["README.md"]
    assert "python main.py" in files["README.md"]


def test_export_default_is_still_run_once() -> None:
    response = export_project(build_base_graph())
    main_py = next(f.content for f in response.files if f.path == "main.py")
    assert "AgentOS(" not in main_py
