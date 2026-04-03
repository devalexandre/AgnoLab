from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from email import message_from_bytes
from email.header import decode_header, make_header
from email.utils import getaddresses
import imaplib
import json
from pathlib import Path
import poplib
import re
import ssl
import threading
import time
from typing import Callable

from .flow_store import FLOWS_DIR, list_flow_records, normalize_flow_name
from .models import EmailListenerStatus, FlowRecord, NodeType


EMAIL_LISTENER_STATE_PATH = FLOWS_DIR.parent / "email_listener_state.json"
EMAIL_LISTENER_DEFAULT_INTERVAL_SECONDS = 15
EMAIL_LISTENER_MIN_INTERVAL_SECONDS = 5
EMAIL_LISTENER_MAX_RESULT_CHARS = 240


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


def _decode_email_header(value: object) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(str(value))))
    except Exception:
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        return str(value)


def _join_email_addresses(value: object) -> str:
    addresses = [address for _name, address in getaddresses([str(value or "")]) if address]
    if addresses:
        return ", ".join(addresses)
    return _decode_email_header(value)


def _extract_email_text(message) -> str:
    plain_parts: list[str] = []
    html_parts: list[str] = []
    parts = message.walk() if message.is_multipart() else [message]
    for part in parts:
        if part.is_multipart():
            continue
        if str(part.get_content_disposition() or "").lower() == "attachment":
            continue
        content_type = str(part.get_content_type() or "").lower()
        payload = part.get_payload(decode=True)
        charset = part.get_content_charset() or "utf-8"
        if payload is None:
            text = part.get_payload()
            if isinstance(text, list):
                continue
            text = str(text or "")
        else:
            try:
                text = payload.decode(charset, errors="replace")
            except Exception:
                text = payload.decode("utf-8", errors="replace")
        if content_type == "text/plain":
            plain_parts.append(text)
        elif content_type == "text/html":
            html_parts.append(text)

    if plain_parts:
        return "\n\n".join(part.strip() for part in plain_parts if part.strip()).strip()
    if html_parts:
        html_text = "\n\n".join(part.strip() for part in html_parts if part.strip())
        html_text = re.sub(r"<[^>]+>", " ", html_text)
        return re.sub(r"\s+", " ", html_text).strip()
    return ""


def _split_filter_values(raw_value: object) -> list[str]:
    return [item.strip().lower() for item in re.split(r"[\n,]+", str(raw_value or "")) if item.strip()]


def _field_matches(value: object, raw_filter: object) -> bool:
    filter_values = _split_filter_values(raw_filter)
    if not filter_values:
        return True
    haystack = str(value or "").lower()
    return any(filter_value in haystack for filter_value in filter_values)


def _keywords_match(value: object, raw_keywords: object) -> bool:
    keywords = _split_filter_values(raw_keywords)
    if not keywords:
        return True
    haystack = str(value or "").lower()
    return all(keyword in haystack for keyword in keywords)


def _truncate_result(value: str | None) -> str | None:
    if not value:
        return None
    compact = " ".join(str(value).split())
    if len(compact) <= EMAIL_LISTENER_MAX_RESULT_CHARS:
        return compact
    return compact[: EMAIL_LISTENER_MAX_RESULT_CHARS - 3].rstrip() + "..."


@dataclass(frozen=True)
class EmailListenerConfig:
    flow_name: str
    node_id: str
    node_name: str
    protocol: str
    security: str
    host: str
    port: int
    mailbox: str
    username: str
    password: str
    max_messages: int
    unread_only: bool
    subject_filter: str
    from_filter: str
    to_filter: str
    body_keywords: str
    poll_interval_seconds: int
    enabled: bool

    @property
    def listener_key(self) -> str:
        return f"{normalize_flow_name(self.flow_name)}:{self.node_id}"


class EmailListenerStateStore:
    def __init__(self, path: Path):
        self._path = path
        self._lock = threading.Lock()
        self._state = self._load()

    def _load(self) -> dict[str, list[str]]:
        if not self._path.exists():
            return {}
        try:
            raw_state = json.loads(self._path.read_text(encoding="utf-8"))
        except Exception:
            return {}
        if not isinstance(raw_state, dict):
            return {}
        normalized: dict[str, list[str]] = {}
        for key, value in raw_state.items():
            if not isinstance(key, str) or not isinstance(value, list):
                continue
            normalized[key] = [str(item) for item in value if str(item).strip()]
        return normalized

    def _persist(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._state, ensure_ascii=False, indent=2), encoding="utf-8")

    def has_seen(self, listener_key: str, message_key: str) -> bool:
        with self._lock:
            return message_key in self._state.get(listener_key, [])

    def mark_seen(self, listener_key: str, message_key: str) -> None:
        with self._lock:
            current = self._state.setdefault(listener_key, [])
            if message_key in current:
                return
            current.append(message_key)
            if len(current) > 200:
                del current[:-200]
            self._persist()


def _match_email_filters(match_data: dict[str, str], config: EmailListenerConfig) -> bool:
    return (
        _field_matches(match_data.get("subject"), config.subject_filter)
        and _field_matches(match_data.get("from"), config.from_filter)
        and _field_matches(match_data.get("to"), config.to_filter)
        and _keywords_match(match_data.get("text"), config.body_keywords)
    )


def _build_match_data(message, *, protocol: str, mailbox: str, message_key: str) -> dict[str, str]:
    return {
        "subject": _decode_email_header(message.get("Subject")),
        "from": _join_email_addresses(message.get("From")),
        "to": _join_email_addresses(message.get("To")),
        "date": str(message.get("Date") or "").strip(),
        "message_id": str(message.get("Message-ID") or "").strip(),
        "protocol": protocol,
        "mailbox": mailbox,
        "text": _extract_email_text(message),
        "message_key": message_key,
    }


def _poll_imap_email(config: EmailListenerConfig) -> dict[str, str] | None:
    client = None
    try:
        if config.security == "ssl":
            client = imaplib.IMAP4_SSL(config.host, config.port)
        else:
            client = imaplib.IMAP4(config.host, config.port)
            if config.security == "starttls":
                client.starttls(ssl.create_default_context())
        client.login(config.username, config.password)
        client.select(config.mailbox)
        search_criterion = "UNSEEN" if config.unread_only else "ALL"
        status, search_data = client.uid("search", None, search_criterion)
        if status != "OK" or not search_data:
            return None

        message_uids = search_data[0].split()
        for message_uid in reversed(message_uids[-config.max_messages:]):
            status, fetched_data = client.uid("fetch", message_uid, "(BODY.PEEK[])")
            if status != "OK" or not fetched_data:
                continue
            raw_message = b""
            for item in fetched_data:
                if isinstance(item, tuple) and len(item) > 1:
                    raw_message = item[1]
                    break
            if not raw_message:
                continue
            match_data = _build_match_data(
                message_from_bytes(raw_message),
                protocol="imap",
                mailbox=config.mailbox,
                message_key=f"imap:{message_uid.decode('utf-8', errors='replace')}",
            )
            if _match_email_filters(match_data, config):
                return match_data
        return None
    finally:
        if client is not None:
            try:
                client.close()
            except Exception:
                pass
            try:
                client.logout()
            except Exception:
                pass


def _poll_pop_email(config: EmailListenerConfig) -> dict[str, str] | None:
    client = None
    try:
        if config.security == "ssl":
            client = poplib.POP3_SSL(config.host, config.port)
        else:
            client = poplib.POP3(config.host, config.port)
            if config.security == "starttls" and hasattr(client, "stls"):
                client.stls(ssl.create_default_context())
        client.user(config.username)
        client.pass_(config.password)
        uidl_entries = client.uidl()[1]
        if not uidl_entries:
            return None

        message_entries: list[tuple[int, str]] = []
        for entry in uidl_entries:
            try:
                number_str, uid_value = entry.decode("utf-8", errors="replace").split(" ", 1)
                message_entries.append((int(number_str), uid_value.strip()))
            except ValueError:
                continue

        for message_number, uid_value in reversed(message_entries[-config.max_messages:]):
            _response, response_lines, _octets = client.retr(message_number)
            raw_message = b"\n".join(response_lines)
            match_data = _build_match_data(
                message_from_bytes(raw_message),
                protocol="pop",
                mailbox="INBOX",
                message_key=f"pop:{uid_value}",
            )
            if _match_email_filters(match_data, config):
                return match_data
        return None
    finally:
        if client is not None:
            try:
                client.quit()
            except Exception:
                pass


def extract_email_listener_configs(record: FlowRecord) -> list[EmailListenerConfig]:
    configs: list[EmailListenerConfig] = []
    for node in record.graph.nodes:
        if node.type != NodeType.INPUT:
            continue

        extras = node.data.extras if isinstance(node.data.extras, dict) else {}
        if str(extras.get("inputSource") or "manual").strip().lower() != "email":
            continue

        protocol = str(extras.get("emailProtocol") or "imap").strip().lower()
        if protocol not in {"imap", "pop"}:
            protocol = "imap"
        security = str(extras.get("emailSecurity") or "ssl").strip().lower()
        if security not in {"ssl", "starttls", "none"}:
            security = "ssl"
        default_port = 995 if protocol == "pop" and security == "ssl" else 110 if protocol == "pop" else 993 if security == "ssl" else 143
        configs.append(
            EmailListenerConfig(
                flow_name=record.name,
                node_id=node.id,
                node_name=node.data.name,
                protocol=protocol,
                security=security,
                host=str(extras.get("emailHost") or "").strip(),
                port=_parse_positive_int(extras.get("emailPort"), default=default_port),
                mailbox=str(extras.get("emailMailbox") or "INBOX").strip() or "INBOX",
                username=str(extras.get("emailUsername") or "").strip(),
                password=str(extras.get("emailPassword") or ""),
                max_messages=_parse_positive_int(extras.get("emailMaxMessages"), default=20),
                unread_only=_normalize_bool(extras.get("emailUnreadOnly"), protocol == "imap"),
                subject_filter=str(extras.get("emailSubjectFilter") or "").strip(),
                from_filter=str(extras.get("emailFromFilter") or "").strip(),
                to_filter=str(extras.get("emailToFilter") or "").strip(),
                body_keywords=str(extras.get("emailBodyKeywords") or "").strip(),
                poll_interval_seconds=_parse_positive_int(
                    extras.get("emailPollIntervalSeconds"),
                    default=EMAIL_LISTENER_DEFAULT_INTERVAL_SECONDS,
                    minimum=EMAIL_LISTENER_MIN_INTERVAL_SECONDS,
                ),
                enabled=_normalize_bool(extras.get("emailListenerEnabled"), True),
            )
        )
    return configs


class EmailListenerWorker:
    def __init__(
        self,
        config: EmailListenerConfig,
        *,
        state_store: EmailListenerStateStore,
        trigger_flow: Callable[[str, dict[str, str]], tuple[bool, str | None]],
    ):
        self.config = config
        self._state_store = state_store
        self._trigger_flow = trigger_flow
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run_loop, name=f"email-listener:{config.listener_key}", daemon=True)
        self._status_lock = threading.Lock()
        self._status = EmailListenerStatus(
            flow_name=config.flow_name,
            node_id=config.node_id,
            node_name=config.node_name,
            protocol=config.protocol,
            host=config.host,
            mailbox=config.mailbox,
            poll_interval_seconds=config.poll_interval_seconds,
            enabled=config.enabled,
            status="starting",
        )
        self._retry_after_by_message: dict[str, float] = {}

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._thread.join(timeout=5)

    def snapshot(self) -> EmailListenerStatus:
        with self._status_lock:
            return self._status.model_copy(deep=True)

    def _update_status(self, **patch: object) -> None:
        with self._status_lock:
            self._status = self._status.model_copy(update=patch)

    def _run_loop(self) -> None:
        self._update_status(status="listening", last_error=None)
        while not self._stop_event.is_set():
            try:
                self._poll_once()
            except Exception as error:
                self._update_status(status="error", last_error=str(error), last_checked_at=_timestamp_now())
            wait_seconds = max(EMAIL_LISTENER_MIN_INTERVAL_SECONDS, self.config.poll_interval_seconds)
            self._stop_event.wait(wait_seconds)

    def _poll_once(self) -> None:
        config = self.config
        self._update_status(status="listening", last_checked_at=_timestamp_now(), last_error=None)

        if not config.enabled:
            self._update_status(status="disabled")
            return
        if not config.host or not config.username or not config.password:
            self._update_status(status="error", last_error="Email listener requires host, username, and password.")
            return

        match = _poll_pop_email(config) if config.protocol == "pop" else _poll_imap_email(config)
        self._update_status(last_checked_at=_timestamp_now())
        if not match:
            return

        message_key = str(match.get("message_key") or "").strip()
        if not message_key:
            fallback_key = str(match.get("message_id") or "").strip()
            if not fallback_key:
                fallback_key = f"{config.protocol}:{hash(json.dumps(match, sort_keys=True, ensure_ascii=False))}"
            message_key = fallback_key
            match["message_key"] = message_key

        if self._state_store.has_seen(config.listener_key, message_key):
            self._update_status(last_processed_message_key=message_key)
            return

        retry_after = self._retry_after_by_message.get(message_key)
        if retry_after and retry_after > time.time():
            return

        success, result_summary = self._trigger_flow(config.flow_name, match)
        if success:
            self._state_store.mark_seen(config.listener_key, message_key)
            self._retry_after_by_message.pop(message_key, None)
            self._update_status(
                status="listening",
                last_triggered_at=_timestamp_now(),
                last_processed_message_key=message_key,
                last_error=None,
                last_result=_truncate_result(result_summary) or "Flow executed successfully.",
            )
            return

        self._retry_after_by_message[message_key] = time.time() + max(60, config.poll_interval_seconds * 4)
        self._update_status(
            status="error",
            last_triggered_at=_timestamp_now(),
            last_processed_message_key=message_key,
            last_error=_truncate_result(result_summary) or "Flow execution failed.",
            last_result=None,
        )


class EmailListenerManager:
    def __init__(self, *, trigger_flow: Callable[[str, dict[str, str]], tuple[bool, str | None]]):
        self._trigger_flow = trigger_flow
        self._state_store = EmailListenerStateStore(EMAIL_LISTENER_STATE_PATH)
        self._lock = threading.Lock()
        self._workers: dict[str, EmailListenerWorker] = {}
        self._started = False

    def start(self) -> None:
        with self._lock:
            if self._started:
                return
            self._started = True
        self.sync_saved_flows()

    def stop(self) -> None:
        with self._lock:
            workers = list(self._workers.values())
            self._workers.clear()
            self._started = False
        for worker in workers:
            worker.stop()

    def sync_saved_flows(self) -> None:
        desired_configs: dict[str, EmailListenerConfig] = {}
        for record in list_flow_records():
            for config in extract_email_listener_configs(record):
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
            worker = EmailListenerWorker(config, state_store=self._state_store, trigger_flow=self._trigger_flow)
            worker.start()
            with self._lock:
                self._workers[listener_key] = worker

    def list_statuses(self, flow_name: str | None = None) -> list[EmailListenerStatus]:
        normalized_flow_name = normalize_flow_name(flow_name) if flow_name else None
        with self._lock:
            workers = list(self._workers.values())
        statuses = [worker.snapshot() for worker in workers]
        if normalized_flow_name:
            statuses = [status for status in statuses if normalize_flow_name(status.flow_name) == normalized_flow_name]
        statuses.sort(key=lambda status: (status.flow_name, status.node_name, status.node_id))
        return statuses
