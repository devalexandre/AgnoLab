"""Tests for CORS origin resolution."""

from __future__ import annotations

from app.main import _resolve_cors_origins


def test_default_origins_are_local_dev_with_credentials(monkeypatch) -> None:
    monkeypatch.delenv("AGNOLAB_CORS_ORIGINS", raising=False)
    origins, allow_credentials = _resolve_cors_origins()
    assert "http://localhost:5173" in origins
    assert "*" not in origins
    assert allow_credentials is True


def test_explicit_origins_are_parsed(monkeypatch) -> None:
    monkeypatch.setenv("AGNOLAB_CORS_ORIGINS", "https://a.com, https://b.com")
    origins, allow_credentials = _resolve_cors_origins()
    assert origins == ["https://a.com", "https://b.com"]
    assert allow_credentials is True


def test_wildcard_disables_credentials(monkeypatch) -> None:
    # Wildcard + credentials is the browser-exploitable combination we must avoid.
    monkeypatch.setenv("AGNOLAB_CORS_ORIGINS", "*")
    origins, allow_credentials = _resolve_cors_origins()
    assert origins == ["*"]
    assert allow_credentials is False
