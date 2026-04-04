from __future__ import annotations

from dataclasses import dataclass
from dataclasses import replace
from datetime import datetime, timezone
import asyncio
import json
from json import JSONDecodeError
import threading
import time
from typing import Callable

import boto3
import requests

from .flow_store import list_flow_records, normalize_flow_name
from .models import FlowRecord, NodeType, QueueSubscriberStatus

QUEUE_INPUT_NODE_TYPES = {
    NodeType.RABBITMQ_INPUT,
    NodeType.KAFKA_INPUT,
    NodeType.REDIS_INPUT,
    NodeType.NATS_INPUT,
    NodeType.SQS_INPUT,
    NodeType.PUBSUB_INPUT,
}

QUEUE_LISTENER_DEFAULT_INTERVAL_SECONDS = 5
QUEUE_LISTENER_MIN_INTERVAL_SECONDS = 2
QUEUE_LISTENER_MAX_RESULT_CHARS = 240


def _timestamp_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_bool(value: object, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value or "").strip().lower()
    if normalized in {"true", "1", "yes", "on"}:
        return True
    if normalized in {"false", "0", "no", "off"}:
        return False
    return default


def _parse_positive_int(value: object, *, default: int, minimum: int = 1) -> int:
    try:
        parsed = int(str(value or "").strip() or default)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, parsed)


def _truncate_result(value: str | None) -> str | None:
    if not value:
        return None
    compact = " ".join(str(value).split())
    if len(compact) <= QUEUE_LISTENER_MAX_RESULT_CHARS:
        return compact
    return compact[: QUEUE_LISTENER_MAX_RESULT_CHARS - 3].rstrip() + "..."


def _extract_text(payload: object) -> str:
    if payload is None:
        return ""
    if isinstance(payload, str):
        return payload
    if isinstance(payload, (int, float, bool)):
        return str(payload)
    if isinstance(payload, (dict, list)):
        return json.dumps(payload, ensure_ascii=False)
    return str(payload)


@dataclass(frozen=True)
class QueueSubscriberConfig:
    flow_name: str
    node_id: str
    node_name: str
    provider: str
    poll_interval_seconds: int
    enabled: bool
    rabbitmq_url: str
    rabbitmq_queue: str
    kafka_bootstrap_servers: str
    kafka_topic: str
    kafka_group_id: str
    redis_url: str
    redis_channel: str
    nats_url: str
    nats_subject: str
    aws_region: str
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_endpoint_url: str
    sqs_queue_url: str
    pubsub_project_id: str
    pubsub_subscription: str
    pubsub_emulator_host: str

    @property
    def listener_key(self) -> str:
        return f"{normalize_flow_name(self.flow_name)}:{self.node_id}"


def extract_queue_subscriber_configs(record: FlowRecord) -> list[QueueSubscriberConfig]:
    configs: list[QueueSubscriberConfig] = []
    for node in record.graph.nodes:
        if node.type not in QUEUE_INPUT_NODE_TYPES:
            continue

        extras = node.data.extras if isinstance(node.data.extras, dict) else {}
        provider = str(extras.get("queueProvider") or "").strip().lower()
        if provider not in {"rabbitmq", "kafka", "redis", "nats", "sqs", "pubsub"}:
            continue

        poll_interval_seconds = _parse_positive_int(
            extras.get("queuePollIntervalSeconds"),
            default=QUEUE_LISTENER_DEFAULT_INTERVAL_SECONDS,
            minimum=QUEUE_LISTENER_MIN_INTERVAL_SECONDS,
        )

        configs.append(
            QueueSubscriberConfig(
                flow_name=record.name,
                node_id=node.id,
                node_name=node.data.name,
                provider=provider,
                poll_interval_seconds=poll_interval_seconds,
                enabled=_normalize_bool(extras.get("queueSubscriberEnabled"), False),
                rabbitmq_url=str(extras.get("rabbitmqUrl") or "amqp://guest:guest@localhost:5672/").strip(),
                rabbitmq_queue=str(extras.get("rabbitmqQueue") or "agnolab.input").strip(),
                kafka_bootstrap_servers=str(extras.get("kafkaBootstrapServers") or "localhost:9092").strip(),
                kafka_topic=str(extras.get("kafkaTopic") or "agnolab.input").strip(),
                kafka_group_id=str(extras.get("kafkaGroupId") or "agnolab-consumer").strip(),
                redis_url=str(extras.get("redisUrl") or "redis://localhost:6379/0").strip(),
                redis_channel=str(extras.get("redisChannel") or "agnolab.input").strip(),
                nats_url=str(extras.get("natsUrl") or "nats://localhost:4222").strip(),
                nats_subject=str(extras.get("natsSubject") or "agnolab.input").strip(),
                aws_region=str(extras.get("awsRegion") or "us-east-1").strip(),
                aws_access_key_id=str(extras.get("awsAccessKeyId") or "test").strip(),
                aws_secret_access_key=str(extras.get("awsSecretAccessKey") or "test").strip(),
                aws_endpoint_url=str(extras.get("awsEndpointUrl") or "http://localhost:4566").strip(),
                sqs_queue_url=str(extras.get("sqsQueueUrl") or "").strip(),
                pubsub_project_id=str(extras.get("pubsubProjectId") or "agnolab-local").strip(),
                pubsub_subscription=str(extras.get("pubsubSubscription") or "agnolab-input-sub").strip(),
                pubsub_emulator_host=str(extras.get("pubsubEmulatorHost") or "localhost:8085").strip(),
            )
        )

    return configs


class QueueSubscriberWorker:
    def __init__(
        self,
        config: QueueSubscriberConfig,
        *,
        trigger_flow: Callable[[str, str, str, dict[str, object]], tuple[bool, str | None]],
    ):
        self.config = config
        self._trigger_flow = trigger_flow
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run_loop, name=f"queue-subscriber:{config.listener_key}", daemon=True)
        self._status_lock = threading.Lock()
        self._status = QueueSubscriberStatus(
            flow_name=config.flow_name,
            node_id=config.node_id,
            node_name=config.node_name,
            provider=config.provider,
            poll_interval_seconds=config.poll_interval_seconds,
            enabled=config.enabled,
            connected=False,
            status="starting",
        )
        self._sqs_client = None
        self._rabbitmq_connection = None
        self._rabbitmq_channel = None
        self._kafka_consumer = None
        self._redis_client = None

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._thread.join(timeout=5)
        self._close_clients()

    def snapshot(self) -> QueueSubscriberStatus:
        with self._status_lock:
            return self._status.model_copy(deep=True)

    def _update_status(self, **patch: object) -> None:
        with self._status_lock:
            self._status = self._status.model_copy(update=patch)

    def _run_loop(self) -> None:
        self._update_status(status="listening", connected=True, last_error=None)
        while not self._stop_event.is_set():
            try:
                self._poll_once()
            except Exception as error:
                self._update_status(status="error", connected=False, last_error=str(error), last_checked_at=_timestamp_now())
            wait_seconds = max(QUEUE_LISTENER_MIN_INTERVAL_SECONDS, self.config.poll_interval_seconds)
            if self.config.provider == "nats":
                wait_seconds = 0
            if wait_seconds > 0:
                self._stop_event.wait(wait_seconds)

        self._update_status(status="stopped", connected=False)

    def _poll_once(self) -> None:
        self._update_status(status="listening", connected=True, last_checked_at=_timestamp_now(), last_error=None)

        if not self.config.enabled:
            self._update_status(status="disabled", connected=False)
            return

        message = self._consume_message()
        if message is None:
            return

        message_id = str(message.get("message_id") or "").strip() or f"{self.config.provider}:{int(time.time() * 1000)}"
        payload_text = _extract_text(message.get("payload") or "")
        if not payload_text.strip():
            return
        payload_received_at = _timestamp_now()
        self._update_status(
            last_payload_received_at=payload_received_at,
            last_payload_preview=_truncate_result(payload_text),
        )

        metadata = {
            "integration_source": "queue_subscriber",
            "queue_provider": self.config.provider,
            "queue_message_id": message_id,
        }
        raw_metadata = message.get("metadata")
        if isinstance(raw_metadata, dict):
            metadata.update(raw_metadata)

        success, result_summary = self._trigger_flow(self.config.flow_name, self.config.node_id, payload_text, metadata)
        if success:
            self._update_status(
                status="listening",
                connected=True,
                last_triggered_at=_timestamp_now(),
                last_message_id=message_id,
                last_error=None,
                last_result=_truncate_result(result_summary) or "Flow executed successfully.",
            )
            return

        self._update_status(
            status="error",
            connected=True,
            last_triggered_at=_timestamp_now(),
            last_message_id=message_id,
            last_error=_truncate_result(result_summary) or "Flow execution failed.",
            last_result=None,
        )

    def _consume_message(self) -> dict[str, object] | None:
        provider = self.config.provider
        if provider == "rabbitmq":
            return self._consume_rabbitmq_message()
        if provider == "kafka":
            return self._consume_kafka_message()
        if provider == "sqs":
            return self._consume_sqs_message()
        if provider == "redis":
            return self._consume_redis_message()
        if provider == "nats":
            return self._consume_nats_message()
        if provider == "pubsub":
            return self._consume_pubsub_message()
        return None

    def _consume_rabbitmq_message(self) -> dict[str, object] | None:
        try:
            import pika
        except ModuleNotFoundError as error:
            raise RuntimeError("RabbitMQ subscriber dependency missing. Install 'pika' to use RabbitMQ queues.") from error

        if not self.config.rabbitmq_queue:
            return None

        if self._rabbitmq_channel is None:
            params = pika.URLParameters(self.config.rabbitmq_url)
            self._rabbitmq_connection = pika.BlockingConnection(params)
            self._rabbitmq_channel = self._rabbitmq_connection.channel()

        method_frame, _header_frame, body = self._rabbitmq_channel.basic_get(
            queue=self.config.rabbitmq_queue,
            auto_ack=False,
        )
        if method_frame is None:
            return None

        self._rabbitmq_channel.basic_ack(delivery_tag=method_frame.delivery_tag)
        payload = body.decode("utf-8", errors="replace") if isinstance(body, (bytes, bytearray)) else str(body or "")
        return {
            "message_id": str(getattr(method_frame, "delivery_tag", "") or ""),
            "payload": payload,
            "metadata": {
                "queue_provider": "rabbitmq",
                "rabbitmq_exchange": str(getattr(method_frame, "exchange", "") or ""),
                "rabbitmq_routing_key": str(getattr(method_frame, "routing_key", "") or ""),
            },
        }

    def _consume_kafka_message(self) -> dict[str, object] | None:
        try:
            from confluent_kafka import Consumer as KafkaConsumer
        except ModuleNotFoundError as error:
            raise RuntimeError("Kafka subscriber dependency missing. Install 'confluent-kafka' to use Kafka queues.") from error

        if not self.config.kafka_topic:
            return None

        if self._kafka_consumer is None:
            self._kafka_consumer = KafkaConsumer(
                {
                    "bootstrap.servers": self.config.kafka_bootstrap_servers,
                    "group.id": self.config.kafka_group_id or f"agnolab-{normalize_flow_name(self.config.flow_name)}",
                    "auto.offset.reset": "latest",
                    "enable.auto.commit": False,
                }
            )
            self._kafka_consumer.subscribe([self.config.kafka_topic])

        message = self._kafka_consumer.poll(0.8)
        if message is None:
            return None
        if message.error():
            raise RuntimeError(f"Kafka consumer error: {message.error()}")

        self._kafka_consumer.commit(message=message, asynchronous=False)
        raw_value = message.value()
        payload = raw_value.decode("utf-8", errors="replace") if isinstance(raw_value, (bytes, bytearray)) else str(raw_value or "")
        raw_key = message.key()
        message_key = raw_key.decode("utf-8", errors="replace") if isinstance(raw_key, (bytes, bytearray)) else str(raw_key or "")
        return {
            "message_id": f"{message.topic()}:{message.partition()}:{message.offset()}",
            "payload": payload,
            "metadata": {
                "queue_provider": "kafka",
                "kafka_topic": message.topic(),
                "kafka_partition": message.partition(),
                "kafka_offset": message.offset(),
                "kafka_key": message_key,
            },
        }

    def _consume_sqs_message(self) -> dict[str, object] | None:
        if not self.config.sqs_queue_url:
            return None
        if self._sqs_client is None:
            kwargs = {
                "region_name": self.config.aws_region,
                "aws_access_key_id": self.config.aws_access_key_id,
                "aws_secret_access_key": self.config.aws_secret_access_key,
            }
            if self.config.aws_endpoint_url:
                kwargs["endpoint_url"] = self.config.aws_endpoint_url
            self._sqs_client = boto3.client("sqs", **kwargs)

        response = self._sqs_client.receive_message(
            QueueUrl=self.config.sqs_queue_url,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=1,
        )
        messages = response.get("Messages") or []
        if not messages:
            return None

        message = messages[0]
        receipt_handle = message.get("ReceiptHandle")
        if receipt_handle:
            self._sqs_client.delete_message(QueueUrl=self.config.sqs_queue_url, ReceiptHandle=receipt_handle)

        payload = message.get("Body")
        metadata = {
            "queue_provider": "sqs",
            "sqs_attributes": message.get("Attributes") or {},
            "sqs_message_attributes": message.get("MessageAttributes") or {},
        }
        return {
            "message_id": message.get("MessageId"),
            "payload": payload,
            "metadata": metadata,
        }

    def _consume_redis_message(self) -> dict[str, object] | None:
        try:
            import redis
        except ModuleNotFoundError as error:
            raise RuntimeError("Redis subscriber dependency missing. Install 'redis' to use Redis queues.") from error

        if self._redis_client is None:
            self._redis_client = redis.Redis.from_url(self.config.redis_url, decode_responses=True)

        payload = self._redis_client.lpop(self.config.redis_channel)
        if payload is None:
            return None

        metadata: dict[str, object] = {
            "queue_provider": "redis",
            "redis_channel": self.config.redis_channel,
        }
        parsed_payload: object = payload
        if isinstance(payload, str):
            try:
                parsed_payload = json.loads(payload)
            except JSONDecodeError:
                parsed_payload = payload

        if isinstance(parsed_payload, dict):
            message_id = parsed_payload.get("id") or parsed_payload.get("message_id")
            body = parsed_payload.get("message") if "message" in parsed_payload else parsed_payload.get("payload", parsed_payload)
            metadata["redis_payload_type"] = "json"
            return {
                "message_id": message_id,
                "payload": body,
                "metadata": metadata,
            }

        return {
            "message_id": None,
            "payload": parsed_payload,
            "metadata": metadata,
        }

    def _consume_nats_message(self) -> dict[str, object] | None:
        listen_timeout_seconds = max(float(QUEUE_LISTENER_MIN_INTERVAL_SECONDS), float(self.config.poll_interval_seconds))

        async def _pull_message() -> tuple[str | None, str | None]:
            try:
                from nats.aio.client import Client as NATS
                from nats.errors import TimeoutError as NatsTimeoutError
            except ModuleNotFoundError as error:
                raise RuntimeError("NATS subscriber dependency missing. Install 'nats-py' to use NATS queues.") from error

            client = NATS()
            await client.connect(servers=[self.config.nats_url], connect_timeout=1)
            subscription = await client.subscribe(self.config.nats_subject)
            try:
                message = await subscription.next_msg(timeout=listen_timeout_seconds)
            except NatsTimeoutError:
                await client.drain()
                return None, None

            payload_text = message.data.decode("utf-8", errors="replace") if isinstance(message.data, (bytes, bytearray)) else str(message.data or "")
            reply = (
                message.reply.decode("utf-8", errors="replace")
                if isinstance(message.reply, (bytes, bytearray))
                else str(message.reply or "")
            )
            await client.drain()
            return payload_text, (reply or None)

        payload_text, reply = asyncio.run(_pull_message())
        if payload_text is None:
            return None

        return {
            "message_id": None,
            "payload": payload_text,
            "metadata": {
                "queue_provider": "nats",
                "nats_subject": self.config.nats_subject,
                "nats_reply": reply,
            },
        }

    def _consume_pubsub_message(self) -> dict[str, object] | None:
        endpoint = self.config.pubsub_emulator_host.strip()
        if not endpoint:
            return None
        if not endpoint.startswith("http://") and not endpoint.startswith("https://"):
            endpoint = f"http://{endpoint}"
        response = requests.post(
            f"{endpoint}/v1/projects/{self.config.pubsub_project_id}/subscriptions/{self.config.pubsub_subscription}:pull",
            json={"maxMessages": 1},
            timeout=2,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            return None
        received = payload.get("receivedMessages")
        if not isinstance(received, list) or not received:
            return None
        message_entry = received[0] if isinstance(received[0], dict) else {}
        ack_id = message_entry.get("ackId")
        message = message_entry.get("message") if isinstance(message_entry.get("message"), dict) else {}
        if ack_id:
            requests.post(
                f"{endpoint}/v1/projects/{self.config.pubsub_project_id}/subscriptions/{self.config.pubsub_subscription}:acknowledge",
                json={"ackIds": [ack_id]},
                timeout=2,
            )

        raw_data = str(message.get("data") or "")
        decoded_data = ""
        if raw_data:
            try:
                import base64

                decoded_data = base64.b64decode(raw_data).decode("utf-8", errors="replace")
            except Exception:
                decoded_data = raw_data

        return {
            "message_id": message.get("messageId") or ack_id,
            "payload": decoded_data,
            "metadata": {
                "queue_provider": "pubsub",
                "pubsub_attributes": message.get("attributes") or {},
            },
        }

    def _close_clients(self) -> None:
        try:
            if self._kafka_consumer is not None:
                self._kafka_consumer.close()
        except Exception:
            pass
        self._kafka_consumer = None

        try:
            if self._rabbitmq_connection is not None and self._rabbitmq_connection.is_open:
                self._rabbitmq_connection.close()
        except Exception:
            pass
        self._rabbitmq_connection = None
        self._rabbitmq_channel = None

        self._redis_client = None


class QueueSubscriberManager:
    def __init__(self, *, trigger_flow: Callable[[str, str, str, dict[str, object]], tuple[bool, str | None]]):
        self._trigger_flow = trigger_flow
        self._lock = threading.Lock()
        self._workers: dict[str, QueueSubscriberWorker] = {}
        self._started = False

    def start(self) -> None:
        with self._lock:
            if self._started:
                return
            self._started = True

    def stop(self) -> None:
        with self._lock:
            workers = list(self._workers.values())
            self._workers.clear()
            self._started = False
        for worker in workers:
            worker.stop()

    def sync_saved_flows(self) -> None:
        desired_configs: dict[str, QueueSubscriberConfig] = {}
        for record in list_flow_records():
            for config in extract_queue_subscriber_configs(record):
                desired_configs[config.listener_key] = config

        with self._lock:
            current_workers = dict(self._workers)

        for listener_key, worker in current_workers.items():
            desired_config = desired_configs.get(listener_key)
            if desired_config is None or desired_config != worker.config:
                worker.stop()
                with self._lock:
                    self._workers.pop(listener_key, None)

        for listener_key, config in desired_configs.items():
            with self._lock:
                existing_worker = self._workers.get(listener_key)
            if existing_worker is not None:
                continue
            if not config.enabled:
                continue
            worker = QueueSubscriberWorker(config, trigger_flow=self._trigger_flow)
            worker.start()
            with self._lock:
                self._workers[listener_key] = worker

    def list_statuses(self, flow_name: str | None = None) -> list[QueueSubscriberStatus]:
        normalized_flow_name = normalize_flow_name(flow_name) if flow_name else None
        with self._lock:
            workers = list(self._workers.values())

        statuses = [worker.snapshot() for worker in workers]
        if normalized_flow_name:
            statuses = [status for status in statuses if normalize_flow_name(status.flow_name) == normalized_flow_name]
        statuses.sort(key=lambda status: (status.flow_name, status.node_name, status.node_id))
        return statuses

    def start_subscriber(self, config: QueueSubscriberConfig) -> None:
        config = replace(config, enabled=True)
        with self._lock:
            existing = self._workers.get(config.listener_key)
        if existing is not None:
            return
        worker = QueueSubscriberWorker(config, trigger_flow=self._trigger_flow)
        worker.start()
        with self._lock:
            self._workers[config.listener_key] = worker

    def stop_subscriber(self, listener_key: str) -> None:
        with self._lock:
            worker = self._workers.pop(listener_key, None)
        if worker is not None:
            worker.stop()

    def get_status(self, listener_key: str) -> QueueSubscriberStatus | None:
        with self._lock:
            worker = self._workers.get(listener_key)
        return worker.snapshot() if worker else None
