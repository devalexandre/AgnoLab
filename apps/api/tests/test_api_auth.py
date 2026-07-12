"""Tests for the global API-key gate."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_dev_mode_allows_requests_without_key(client, monkeypatch) -> None:
    monkeypatch.delenv("AGNOLAB_API_KEY", raising=False)
    assert client.get("/health").status_code == 200
    # No key configured -> management endpoints are reachable (local dev).
    assert client.post("/api/codegen/preview", json={"graph": {}}).status_code != 401


def test_missing_key_is_rejected_when_configured(client, monkeypatch) -> None:
    monkeypatch.setenv("AGNOLAB_API_KEY", "secret123")
    assert client.post("/api/codegen/preview", json={"graph": {}}).status_code == 401


def test_wrong_key_is_rejected(client, monkeypatch) -> None:
    monkeypatch.setenv("AGNOLAB_API_KEY", "secret123")
    resp = client.post("/api/codegen/preview", json={"graph": {}}, headers={"X-API-Key": "nope"})
    assert resp.status_code == 401


def test_correct_key_via_header_is_accepted(client, monkeypatch) -> None:
    monkeypatch.setenv("AGNOLAB_API_KEY", "secret123")
    resp = client.post("/api/codegen/preview", json={"graph": {}}, headers={"X-API-Key": "secret123"})
    assert resp.status_code != 401


def test_correct_key_via_bearer_is_accepted(client, monkeypatch) -> None:
    monkeypatch.setenv("AGNOLAB_API_KEY", "secret123")
    resp = client.post(
        "/api/codegen/preview",
        json={"graph": {}},
        headers={"Authorization": "Bearer secret123"},
    )
    assert resp.status_code != 401


def test_health_is_always_public(client, monkeypatch) -> None:
    monkeypatch.setenv("AGNOLAB_API_KEY", "secret123")
    assert client.get("/health").status_code == 200


def test_external_trigger_endpoints_are_exempt(client, monkeypatch) -> None:
    # flows/run authenticates per-flow via bearer token, not the global key.
    monkeypatch.setenv("AGNOLAB_API_KEY", "secret123")
    assert client.post("/api/flows/run", json={"name": "does-not-exist"}).status_code != 401
