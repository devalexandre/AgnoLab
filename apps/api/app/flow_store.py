from __future__ import annotations

import contextlib
import os
import re
import tempfile
import threading
from datetime import UTC, datetime
from pathlib import Path

from .models import CanvasGraph, FlowRecord, FlowSummary

FLOWS_DIR = Path(__file__).resolve().parents[1] / "data" / "flows"

# Serializes read-modify-write on flow files; the API is multi-threaded (request
# handlers plus the email/queue listener threads all touch the flow store).
_WRITE_LOCK = threading.Lock()


def _timestamp_now() -> str:
    return datetime.now(UTC).isoformat()


def _atomic_write_text(path: Path, content: str) -> None:
    """Write via a temp file + atomic rename so a crash mid-write can't corrupt the target."""
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.stem}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp_name)
        raise


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

    with _WRITE_LOCK:
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
        _atomic_write_text(path, record.model_dump_json(indent=2))
    return record


def load_flow_record(name: str) -> FlowRecord | None:
    path = _flow_path_by_name(name)
    if not path.exists():
        return None
    return FlowRecord.model_validate_json(path.read_text(encoding="utf-8"))


def delete_flow_record(name: str) -> bool:
    path = _flow_path_by_name(name)
    with _WRITE_LOCK:
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
