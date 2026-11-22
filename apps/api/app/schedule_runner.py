"""Cron schedules for saved flows.

An Input node whose ``inputSource`` is ``schedule`` makes its saved flow run on a cron
expression (``scheduleCron``) in a time zone (``scheduleTimezone``, default UTC), with
``scheduleInputText`` (or the node's input text) as the run input.

One background thread checks every schedule; a due flow runs on its own thread so a slow
run never delays the others, and a schedule never overlaps with its own previous run.
Missed runs while the API was down are not replayed: on start, each schedule waits for its
next occurrence.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from croniter import croniter  # type: ignore[import-untyped]

from .flow_store import list_flow_records, normalize_flow_name
from .models import FlowRecord, NodeType, ScheduleStatus

SCHEDULE_TICK_SECONDS = 15
SCHEDULE_MAX_RESULT_CHARS = 240

TriggerFlow = Callable[[str, "ScheduleConfig"], tuple[bool, str | None]]


@dataclass(frozen=True)
class ScheduleConfig:
    flow_name: str
    node_id: str
    node_name: str
    cron: str
    timezone: str
    input_text: str
    enabled: bool

    @property
    def key(self) -> str:
        return f"{normalize_flow_name(self.flow_name)}:{self.node_id}"


def resolve_timezone(name: str) -> ZoneInfo | None:
    try:
        return ZoneInfo(name or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return None


def validate_schedule(cron: str, timezone: str) -> str | None:
    """Return an error message, or None when the cron expression and time zone are usable."""
    if not cron.strip():
        return "Cron expression is empty."
    if not croniter.is_valid(cron):
        return f"Invalid cron expression: {cron!r}."
    if resolve_timezone(timezone) is None:
        return f"Unknown time zone: {timezone!r}."
    return None


def next_run_after(cron: str, timezone: str, after: datetime) -> datetime:
    """Next occurrence strictly after ``after``, as an aware datetime in UTC."""
    zone = resolve_timezone(timezone) or ZoneInfo("UTC")
    local_after = after.astimezone(zone)
    return croniter(cron, local_after).get_next(datetime).astimezone(UTC)


def _as_bool(value: object, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value or "").strip().lower()
    if normalized in {"true", "1", "yes", "on"}:
        return True
    if normalized in {"false", "0", "no", "off"}:
        return False
    return default


def extract_schedule_configs(record: FlowRecord) -> list[ScheduleConfig]:
    configs: list[ScheduleConfig] = []
    for node in record.graph.nodes:
        if node.type != NodeType.INPUT:
            continue
        extras = node.data.extras or {}
        if str(extras.get("inputSource") or "manual").strip().lower() != "schedule":
            continue
        configs.append(
            ScheduleConfig(
                flow_name=record.name,
                node_id=node.id,
                node_name=node.data.name,
                cron=str(extras.get("scheduleCron") or "").strip(),
                timezone=str(extras.get("scheduleTimezone") or "UTC").strip() or "UTC",
                input_text=str(extras.get("scheduleInputText") or extras.get("inputText") or node.data.prompt or ""),
                enabled=_as_bool(extras.get("scheduleEnabled"), True),
            )
        )
    return configs


def _truncate(value: str | None) -> str | None:
    if not value:
        return value
    value = value.strip()
    return value if len(value) <= SCHEDULE_MAX_RESULT_CHARS else value[: SCHEDULE_MAX_RESULT_CHARS - 1] + "…"


class _ScheduleEntry:
    def __init__(self, config: ScheduleConfig, now: datetime):
        self.config = config
        self.running = False
        error = validate_schedule(config.cron, config.timezone)
        self.status = ScheduleStatus(
            flow_name=config.flow_name,
            node_id=config.node_id,
            node_name=config.node_name,
            cron=config.cron,
            timezone=config.timezone,
            enabled=config.enabled,
            status="invalid" if error else ("scheduled" if config.enabled else "paused"),
            last_error=error,
        )
        self.next_run: datetime | None = None
        if not error and config.enabled:
            self._advance(now)

    def _advance(self, now: datetime) -> None:
        self.next_run = next_run_after(self.config.cron, self.config.timezone, now)
        self.status.next_run_at = self.next_run.isoformat()


class ScheduleManager:
    def __init__(
        self,
        *,
        trigger_flow: TriggerFlow,
        tick_seconds: float = SCHEDULE_TICK_SECONDS,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        run_async: bool = True,
    ):
        self._trigger_flow = trigger_flow
        self._tick_seconds = tick_seconds
        self._clock = clock
        self._run_async = run_async
        self._entries: dict[str, _ScheduleEntry] = {}
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self.sync_saved_flows()
        if self._thread is None or not self._thread.is_alive():
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._loop, name="agnolab-schedules", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
            self._thread = None

    def sync_saved_flows(self, records: list[FlowRecord] | None = None) -> None:
        desired = {
            config.key: config
            for record in (records if records is not None else list_flow_records())
            for config in extract_schedule_configs(record)
        }
        now = self._clock()
        with self._lock:
            for key in list(self._entries):
                if key not in desired or desired[key] != self._entries[key].config:
                    del self._entries[key]
            for key, config in desired.items():
                if key not in self._entries:
                    self._entries[key] = _ScheduleEntry(config, now)

    def tick(self) -> None:
        """Run every schedule that is due. Called by the background loop (and by tests)."""
        now = self._clock()
        due: list[_ScheduleEntry] = []
        with self._lock:
            for entry in self._entries.values():
                if entry.next_run is None or entry.running or now < entry.next_run:
                    continue
                entry.running = True
                entry.status.status = "running"
                entry._advance(now)
                due.append(entry)
        for entry in due:
            if self._run_async:
                threading.Thread(target=self._run, args=(entry,), name=f"agnolab-schedule-{entry.config.key}", daemon=True).start()
            else:
                self._run(entry)

    def _run(self, entry: _ScheduleEntry) -> None:
        started = self._clock()
        try:
            success, summary = self._trigger_flow(entry.config.flow_name, entry.config)
            error = None if success else (summary or "Flow run failed.")
        except Exception as exc:  # a broken flow must not kill the scheduler
            success, summary, error = False, None, str(exc)
        with self._lock:
            entry.running = False
            entry.status.status = "scheduled" if success else "error"
            entry.status.last_run_at = started.isoformat()
            entry.status.run_count += 1
            entry.status.last_result = _truncate(summary)
            entry.status.last_error = _truncate(error)

    def _loop(self) -> None:
        while not self._stop_event.wait(self._tick_seconds):
            self.tick()

    def list_statuses(self, flow_name: str | None = None) -> list[ScheduleStatus]:
        wanted = normalize_flow_name(flow_name) if flow_name else None
        with self._lock:
            statuses = [entry.status.model_copy() for entry in self._entries.values()]
        if wanted:
            statuses = [status for status in statuses if normalize_flow_name(status.flow_name) == wanted]
        return sorted(statuses, key=lambda status: (status.flow_name, status.node_name, status.node_id))
