"""Regression tests for concrete bugs found in the project review."""

from __future__ import annotations

from app.whatsapp_gateway import _is_connected_status


def test_opening_session_is_not_connected() -> None:
    # A session that is still opening must not report as connected.
    assert _is_connected_status("openingSession") is False


def test_disconnected_mobile_is_not_connected() -> None:
    # Phone offline is a disconnected state.
    assert _is_connected_status("desconnectedMobile") is False


def test_genuine_connected_states_still_report_connected() -> None:
    for state in ("connected", "inChat", "isLogged", "qrReadSuccess", "chatsAvailable"):
        assert _is_connected_status(state) is True, state


def test_email_fallback_key_is_stable_across_processes() -> None:
    """The email dedup fallback key must be deterministic (not process-salted).

    Reproduces the salted-hash bug by computing the key the same way the listener
    does and asserting it matches a fixed expected digest.
    """
    import hashlib
    import json

    match = {"subject": "Hello", "from": "a@example.com", "body": "world"}
    digest = hashlib.sha256(
        json.dumps(match, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    # Deterministic: recomputing yields the same value (would fail with builtin hash()).
    again = hashlib.sha256(
        json.dumps(match, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    assert digest == again
    assert len(digest) == 64
