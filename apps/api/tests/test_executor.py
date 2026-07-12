"""Tests for the subprocess executor and its resource guards."""

from __future__ import annotations

import time

from app.executor import _build_subprocess_env, _max_timeout_seconds, run_generated_code


def test_runs_simple_program() -> None:
    ok, stdout, _stderr, rc = run_generated_code("print('hello')")
    assert ok is True
    assert stdout.strip() == "hello"
    assert rc == 0


def test_nonzero_exit_is_reported_as_failure() -> None:
    ok, _stdout, _stderr, rc = run_generated_code("raise SystemExit(3)")
    assert ok is False
    assert rc == 3


def test_timeout_kills_runaway_process() -> None:
    start = time.monotonic()
    ok, _stdout, stderr, rc = run_generated_code(
        "import time\nwhile True: time.sleep(1)",
        timeout_seconds=2,
    )
    elapsed = time.monotonic() - start
    assert ok is False
    assert "timed out" in stderr.lower()
    assert rc is None
    # Must be killed promptly, not left running well past the deadline.
    assert elapsed < 8, f"process not terminated promptly (took {elapsed:.1f}s)"


def test_max_timeout_env_is_honored(monkeypatch) -> None:
    monkeypatch.setenv("AGNOLAB_MAX_EXECUTION_SECONDS", "42")
    assert _max_timeout_seconds() == 42.0


def test_max_timeout_falls_back_on_bad_value(monkeypatch) -> None:
    monkeypatch.setenv("AGNOLAB_MAX_EXECUTION_SECONDS", "not-a-number")
    assert _max_timeout_seconds() == 300.0


def test_default_env_inherits_host(monkeypatch) -> None:
    monkeypatch.delenv("AGNOLAB_ISOLATE_ENV", raising=False)
    monkeypatch.setenv("UNRELATED_HOST_SECRET", "leak-me")
    env = _build_subprocess_env({"FLOW_SECRET": "v"}, None, {"OPENAI_API_KEY"})
    # Backwards-compatible default: full host env is inherited.
    assert env.get("UNRELATED_HOST_SECRET") == "leak-me"
    assert env.get("FLOW_SECRET") == "v"


def test_isolated_env_drops_unrelated_secrets(monkeypatch) -> None:
    monkeypatch.setenv("AGNOLAB_ISOLATE_ENV", "1")
    monkeypatch.setenv("UNRELATED_HOST_SECRET", "leak-me")
    monkeypatch.setenv("OPENAI_API_KEY", "ambient-key")
    env = _build_subprocess_env({"FLOW_SECRET": "v"}, "ambient-key", {"OPENAI_API_KEY"})
    assert "UNRELATED_HOST_SECRET" not in env
    assert env.get("PATH") is not None  # system essentials survive
    assert env.get("OPENAI_API_KEY") == "ambient-key"  # provider fallback preserved
    assert env.get("FLOW_SECRET") == "v"  # injected flow secret present


def test_isolated_env_honors_explicit_forward_list(monkeypatch) -> None:
    monkeypatch.setenv("AGNOLAB_ISOLATE_ENV", "1")
    monkeypatch.setenv("MY_CUSTOM_VAR", "keep-me")
    monkeypatch.setenv("AGNOLAB_FORWARD_ENV", "MY_CUSTOM_VAR")
    env = _build_subprocess_env(None, None, set())
    assert env.get("MY_CUSTOM_VAR") == "keep-me"
