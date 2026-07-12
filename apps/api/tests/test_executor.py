"""Tests for the subprocess executor and its resource guards."""

from __future__ import annotations

import time

from app.executor import _max_timeout_seconds, run_generated_code


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
