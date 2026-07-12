"""Queue output dispatch must route to every broker, not just NATS.

Previously only NATS_OUTPUT was dispatched; RabbitMQ/Kafka/Redis/SQS/PubSub output
nodes were silent no-ops. These tests verify each type now routes to its publisher
and that failures/misconfig surface as dispatch errors instead of crashing.
"""

from __future__ import annotations

import pytest

from app import main
from app.models import CanvasGraph, GraphNode, NodeData, Position


def _graph_with_output(node_type: str, extras: dict) -> CanvasGraph:
    node = GraphNode(
        id="out1",
        type=node_type,
        position=Position(),
        data=NodeData(name=f"{node_type} out", extras=extras),
    )
    return CanvasGraph(nodes=[node], edges=[])


@pytest.mark.parametrize(
    ("node_type", "extras", "publisher"),
    [
        ("rabbitmq_output", {"rabbitmqQueue": "q"}, "_publish_rabbitmq_output_payload"),
        ("kafka_output", {"kafkaTopic": "t"}, "_publish_kafka_output_payload"),
        ("redis_output", {"redisChannel": "c"}, "_publish_redis_output_payload"),
        ("sqs_output", {"sqsQueueUrl": "http://localhost:4566/q"}, "_publish_sqs_output_payload"),
        ("pubsub_output", {"pubsubTopic": "tp"}, "_publish_pubsub_output_payload"),
        ("nats_output", {"natsSubject": "s"}, "_publish_nats_output_payload"),
    ],
)
def test_each_queue_output_routes_to_its_publisher(node_type, extras, publisher, monkeypatch) -> None:
    calls: list[dict] = []
    monkeypatch.setattr(main, publisher, lambda **kwargs: calls.append(kwargs))

    graph = _graph_with_output(node_type, extras)
    errors = main._dispatch_queue_output_payloads(graph, payload_text="hello", target_input_node_id=None)

    assert errors == [], f"unexpected dispatch errors: {errors}"
    assert len(calls) == 1, f"{publisher} was not called exactly once"
    assert calls[0]["payload_text"] == "hello"


def test_missing_sqs_queue_url_is_reported_not_dispatched(monkeypatch) -> None:
    # SQS has no sensible default queue URL, so a blank one must be reported.
    called = False

    def _fail(**_kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(main, "_publish_sqs_output_payload", _fail)
    graph = _graph_with_output("sqs_output", {"sqsQueueUrl": ""})
    errors = main._dispatch_queue_output_payloads(graph, payload_text="hi", target_input_node_id=None)

    assert called is False
    assert any("empty SQS queue URL" in e for e in errors)


def test_publisher_exception_becomes_dispatch_error(monkeypatch) -> None:
    def _boom(**_kwargs):
        raise RuntimeError("broker down")

    monkeypatch.setattr(main, "_publish_redis_output_payload", _boom)
    graph = _graph_with_output("redis_output", {"redisChannel": "c"})
    errors = main._dispatch_queue_output_payloads(graph, payload_text="hi", target_input_node_id=None)

    assert len(errors) == 1
    assert "broker down" in errors[0]


def test_empty_payload_dispatches_nothing(monkeypatch) -> None:
    calls: list[dict] = []
    monkeypatch.setattr(main, "_publish_redis_output_payload", lambda **k: calls.append(k))
    graph = _graph_with_output("redis_output", {"redisChannel": "c"})
    errors = main._dispatch_queue_output_payloads(graph, payload_text="   ", target_input_node_id=None)

    assert errors == []
    assert calls == []
