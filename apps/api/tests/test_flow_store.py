"""Tests for saved-flow persistence, including path-traversal safety."""

from __future__ import annotations

import pytest

from app import flow_store
from app.models import CanvasGraph


@pytest.fixture(autouse=True)
def _isolate_flows_dir(tmp_path, monkeypatch):
    """Point the flow store at a temp dir so tests never touch real data."""
    monkeypatch.setattr(flow_store, "FLOWS_DIR", tmp_path / "flows")
    yield


def test_save_and_load_round_trip() -> None:
    graph = CanvasGraph()
    saved = flow_store.save_flow_record("My Flow", graph)
    assert saved.name == "My Flow"

    loaded = flow_store.load_flow_record("My Flow")
    assert loaded is not None
    assert loaded.name == "My Flow"
    assert loaded.created_at == saved.created_at


def test_created_at_is_preserved_on_resave() -> None:
    flow_store.save_flow_record("stable", CanvasGraph())
    first = flow_store.load_flow_record("stable")
    resaved = flow_store.save_flow_record("stable", CanvasGraph())
    assert first is not None
    assert resaved.created_at == first.created_at


@pytest.mark.parametrize(
    ("raw", "expected_slug"),
    [
        ("Hello World", "hello_world"),
        ("../../etc/passwd", "etc_passwd"),
        ("a/b/c", "a_b_c"),
        ("  Spaced  ", "spaced"),
    ],
)
def test_normalize_flow_name_is_slug_safe(raw: str, expected_slug: str) -> None:
    assert flow_store.normalize_flow_name(raw) == expected_slug


def test_normalize_flow_name_rejects_empty() -> None:
    with pytest.raises(ValueError):
        flow_store.normalize_flow_name("   ")


def test_path_traversal_name_stays_inside_flows_dir() -> None:
    flow_store.save_flow_record("../../escape", CanvasGraph())
    written = list(flow_store.FLOWS_DIR.glob("*.json"))
    assert len(written) == 1
    # The file must live directly under FLOWS_DIR, not escape via '..'.
    assert written[0].parent == flow_store.FLOWS_DIR


def test_delete_flow_record() -> None:
    flow_store.save_flow_record("temp", CanvasGraph())
    assert flow_store.delete_flow_record("temp") is True
    assert flow_store.load_flow_record("temp") is None
    assert flow_store.delete_flow_record("temp") is False
