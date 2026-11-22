"""Cron schedules for saved flows (app/schedule_runner.py), driven by a fake clock."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models import FlowRecord
from app.sample_graph import build_base_graph
from app.schedule_runner import ScheduleManager, extract_schedule_configs, next_run_after, validate_schedule


def _record(name: str = "daily_digest", **schedule: object) -> FlowRecord:
    graph = build_base_graph()
    input_node = next(node for node in graph.nodes if node.type.value == "input")
    input_node.data.extras = {**(input_node.data.extras or {}), "inputSource": "schedule", **schedule}
    return FlowRecord(name=name, graph=graph, created_at="2026-01-01T00:00:00Z", updated_at="2026-01-01T00:00:00Z")


class FakeClock:
    def __init__(self, start: datetime):
        self.now = start

    def __call__(self) -> datetime:
        return self.now


def test_validate_schedule() -> None:
    assert validate_schedule("*/5 * * * *", "UTC") is None
    assert "Invalid cron" in (validate_schedule("every day", "UTC") or "")
    assert "Unknown time zone" in (validate_schedule("0 9 * * *", "Mars/Olympus") or "")
    assert "empty" in (validate_schedule("", "UTC") or "")


def test_next_run_respects_time_zone() -> None:
    after = datetime(2026, 3, 2, 10, 0, tzinfo=UTC)  # 07:00 in Sao Paulo (UTC-3)
    assert next_run_after("0 9 * * *", "America/Sao_Paulo", after) == datetime(2026, 3, 2, 12, 0, tzinfo=UTC)
    assert next_run_after("0 9 * * *", "UTC", after) == datetime(2026, 3, 3, 9, 0, tzinfo=UTC)


def test_extract_configs_only_from_schedule_inputs() -> None:
    configs = extract_schedule_configs(_record(scheduleCron="0 9 * * 1-5", scheduleTimezone="Europe/Lisbon", scheduleInputText="digest"))
    assert len(configs) == 1
    assert configs[0].cron == "0 9 * * 1-5"
    assert configs[0].timezone == "Europe/Lisbon"
    assert configs[0].input_text == "digest"
    manual = _record()
    manual.graph.nodes[0].data.extras["inputSource"] = "manual"
    assert extract_schedule_configs(manual) == []


def test_runs_when_due_and_reschedules() -> None:
    clock = FakeClock(datetime(2026, 3, 2, 8, 59, 30, tzinfo=UTC))
    runs: list[str] = []
    manager = ScheduleManager(trigger_flow=lambda name, config: (runs.append(name) or True, "ok"), clock=clock, run_async=False)
    manager.sync_saved_flows([_record(scheduleCron="0 9 * * *")])

    manager.tick()
    assert runs == []  # not yet

    clock.now = datetime(2026, 3, 2, 9, 0, 5, tzinfo=UTC)
    manager.tick()
    assert runs == ["daily_digest"]
    status = manager.list_statuses()[0]
    assert status.run_count == 1 and status.status == "scheduled"
    assert status.next_run_at == "2026-03-03T09:00:00+00:00"

    manager.tick()  # same minute: no double run
    assert runs == ["daily_digest"]


def test_failed_run_is_reported_and_scheduler_keeps_going() -> None:
    clock = FakeClock(datetime(2026, 3, 2, 9, 0, 1, tzinfo=UTC))

    def boom(name, config):
        raise RuntimeError("provider down")

    manager = ScheduleManager(trigger_flow=boom, clock=clock, run_async=False)
    manager.sync_saved_flows([_record(scheduleCron="* * * * *")])
    clock.now += timedelta(minutes=1)
    manager.tick()
    status = manager.list_statuses()[0]
    assert status.status == "error"
    assert "provider down" in (status.last_error or "")
    assert status.next_run_at is not None


def test_invalid_and_paused_schedules_never_run() -> None:
    clock = FakeClock(datetime(2026, 3, 2, 9, 0, tzinfo=UTC))
    runs: list[str] = []
    manager = ScheduleManager(trigger_flow=lambda name, config: (runs.append(name) or True, None), clock=clock, run_async=False)
    manager.sync_saved_flows(
        [_record("bad", scheduleCron="nope"), _record("paused", scheduleCron="* * * * *", scheduleEnabled=False)]
    )
    clock.now += timedelta(hours=1)
    manager.tick()
    assert runs == []
    statuses = {status.flow_name: status for status in manager.list_statuses()}
    assert statuses["bad"].status == "invalid"
    assert statuses["paused"].status == "paused"


def test_resync_drops_removed_schedules() -> None:
    clock = FakeClock(datetime(2026, 3, 2, 9, 0, tzinfo=UTC))
    manager = ScheduleManager(trigger_flow=lambda name, config: (True, None), clock=clock, run_async=False)
    manager.sync_saved_flows([_record(scheduleCron="0 9 * * *")])
    assert len(manager.list_statuses()) == 1
    manager.sync_saved_flows([])
    assert manager.list_statuses() == []


def test_schedule_input_compiles_like_a_manual_input() -> None:
    from app.compiler import compile_graph

    record = _record(scheduleCron="0 9 * * *")
    record.graph.nodes[0].data.extras["inputText"] = "Write the morning digest."
    code, warnings = compile_graph(record.graph)
    assert "Write the morning digest." in code
    assert warnings == []
