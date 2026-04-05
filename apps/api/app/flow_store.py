from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re

from .models import CanvasGraph, FlowRecord, FlowSummary


FLOWS_DIR = Path(__file__).resolve().parents[1] / "data" / "flows"


def _timestamp_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_flow_name(name: str) -> str:
    cleaned = (name or "").strip()
    if not cleaned:
        raise ValueError("Flow name is required.")

    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", cleaned).strip("_").lower()
    if not slug:
        raise ValueError("Flow name must include at least one alphanumeric character.")
    return slug


def _flow_path_by_name(name: str) -> Path:
    slug = normalize_flow_name(name)
    return FLOWS_DIR / f"{slug}.json"


def save_flow_record(name: str, graph: CanvasGraph) -> FlowRecord:
    cleaned_name = name.strip()
    path = _flow_path_by_name(cleaned_name)
    FLOWS_DIR.mkdir(parents=True, exist_ok=True)

    created_at = _timestamp_now()
    if path.exists():
        existing = FlowRecord.model_validate_json(path.read_text(encoding="utf-8"))
        created_at = existing.created_at

    record = FlowRecord(
        name=cleaned_name,
        graph=graph,
        created_at=created_at,
        updated_at=_timestamp_now(),
    )
    path.write_text(record.model_dump_json(indent=2), encoding="utf-8")
    return record


def load_flow_record(name: str) -> FlowRecord | None:
    path = _flow_path_by_name(name)
    if not path.exists():
        return None
    return FlowRecord.model_validate_json(path.read_text(encoding="utf-8"))


def delete_flow_record(name: str) -> bool:
    path = _flow_path_by_name(name)
    if not path.exists():
        return False
    path.unlink()
    return True


def list_flow_summaries() -> list[FlowSummary]:
    if not FLOWS_DIR.exists():
        return []

    summaries: list[FlowSummary] = []
    for path in FLOWS_DIR.glob("*.json"):
        try:
            record = FlowRecord.model_validate_json(path.read_text(encoding="utf-8"))
            summaries.append(FlowSummary(name=record.name, updated_at=record.updated_at))
        except Exception:
            continue

    summaries.sort(key=lambda flow: flow.updated_at, reverse=True)
    return summaries


def list_flow_records() -> list[FlowRecord]:
    if not FLOWS_DIR.exists():
        return []

    records: list[FlowRecord] = []
    for path in FLOWS_DIR.glob("*.json"):
        try:
            records.append(FlowRecord.model_validate_json(path.read_text(encoding="utf-8")))
        except Exception:
            continue

    records.sort(key=lambda record: record.updated_at, reverse=True)
    return records
