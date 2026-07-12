"""Secrets must be routed through the runner environment, never inlined into code.

Covers provider extra env (provider_env_json) and email passwords (input + output),
complementing the provider-API-key coverage in test_compiler_golden.py.

NOTE FOR SECRET SCANNERS AND REVIEWERS: the "fake-not-a-real-*" strings below are
throwaway fixtures, not credentials. They exist precisely so each test can assert the
value does NOT appear in the generated source. There is nothing here to revoke.
"""

from __future__ import annotations

from app.compiler import (
    build_provider_env_setup,
    collect_graph_runtime_secrets,
    email_password_env_name,
    render_input_payload,
    render_output_api_dispatch,
)
from app.models import CanvasGraph, GraphNode, NodeData, Position


def _agent_with_provider_env(secret: str) -> GraphNode:
    return GraphNode(
        id="ag1",
        type="agent",
        position=Position(),
        data=NodeData(
            name="A",
            provider="openai",
            extras={
                "providerConfig": {
                    "provider_profile": "openai",
                    "provider_env_json": '{"MY_SECRET": "' + secret + '"}',
                }
            },
        ),
    )


def test_provider_env_json_is_not_inlined() -> None:
    node = _agent_with_provider_env("fake-not-a-real-secret-xyz")
    lines = build_provider_env_setup(node)
    assert all("fake-not-a-real-secret-xyz" not in line for line in lines)


def test_provider_env_json_is_collected_for_runtime() -> None:
    node = _agent_with_provider_env("fake-not-a-real-secret-xyz")
    secrets = collect_graph_runtime_secrets(CanvasGraph(nodes=[node], edges=[]))
    assert secrets.get("MY_SECRET") == "fake-not-a-real-secret-xyz"


def test_email_input_password_routed_through_env() -> None:
    node = GraphNode(
        id="in1",
        type="input",
        position=Position(),
        data=NodeData(
            name="Mail",
            extras={
                "inputSource": "email",
                "emailProtocol": "imap",
                "emailHost": "imap.x.com",
                "emailUsername": "u",
                "emailPassword": "fake-not-a-real-email-pw-in",
            },
        ),
    )
    code = "\n".join(render_input_payload(node))
    assert "fake-not-a-real-email-pw-in" not in code
    assert f"os.getenv('{email_password_env_name('in1')}'" in code

    secrets = collect_graph_runtime_secrets(CanvasGraph(nodes=[node], edges=[]))
    assert secrets.get(email_password_env_name("in1")) == "fake-not-a-real-email-pw-in"


def test_email_output_password_routed_through_env() -> None:
    node = GraphNode(
        id="out1",
        type="output_api",
        position=Position(),
        data=NodeData(
            name="O",
            extras={
                "outputMode": "email",
                "emailHost": "smtp.x.com",
                "emailFrom": "a@x.com",
                "emailTo": "b@x.com",
                "emailPassword": "fake-not-a-real-email-pw-out",
            },
        ),
    )
    lines, _warnings = render_output_api_dispatch(node, project_name="p")
    code = "\n".join(lines)
    assert "fake-not-a-real-email-pw-out" not in code
    assert f"os.getenv('{email_password_env_name('out1')}'" in code

    secrets = collect_graph_runtime_secrets(CanvasGraph(nodes=[node], edges=[]))
    assert secrets.get(email_password_env_name("out1")) == "fake-not-a-real-email-pw-out"
