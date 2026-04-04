from __future__ import annotations

import os
import re
import base64
import time
from typing import Any

import requests


DEFAULT_WHATSAPP_GATEWAY_BASE_URL = "http://whatsapp:21465"
DEFAULT_WHATSAPP_GATEWAY_SECRET_KEY = "agnolab_wppconnect_secret"
DEFAULT_WHATSAPP_WEBHOOK_BASE_URL = "http://api:8000"


def normalize_whatsapp_session_id(value: object, *, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(value or "").strip()).strip("_")
    return cleaned or fallback


def _recursive_find_first_string(payload: Any, keys: tuple[str, ...]) -> str:
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        for value in payload.values():
            found = _recursive_find_first_string(value, keys)
            if found:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _recursive_find_first_string(item, keys)
            if found:
                return found
    return ""


def _looks_like_base64(value: str) -> bool:
    compact = "".join(value.split())
    if len(compact) < 128:
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9+/=]+", compact))


def _normalize_qr_code(value: str) -> str:
    qr_value = str(value or "").strip()
    if not qr_value:
        return ""
    if qr_value.startswith("data:image/"):
        return qr_value
    if _looks_like_base64(qr_value):
        return f"data:image/png;base64,{qr_value}"
    return qr_value


def _normalize_status(value: object) -> str:
    return str(value or "").strip() or "unknown"


def _is_connected_status(value: object) -> bool:
    normalized = _normalize_status(value).lower()
    return normalized in {
        "connected",
        "authenticated",
        "inchat",
        "islogged",
        "qrreadsuccess",
        "chatsavailable",
        "openingsession",
        "desconnectedmobile",
    }


class WhatsappGatewayClient:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        secret_key: str | None = None,
        webhook_base_url: str | None = None,
        timeout_seconds: float = 20.0,
    ) -> None:
        self.base_url = (base_url or os.getenv("WHATSAPP_GATEWAY_BASE_URL") or DEFAULT_WHATSAPP_GATEWAY_BASE_URL).rstrip("/")
        self.secret_key = (secret_key or os.getenv("WHATSAPP_GATEWAY_SECRET_KEY") or DEFAULT_WHATSAPP_GATEWAY_SECRET_KEY).strip()
        self.webhook_base_url = (
            webhook_base_url or os.getenv("WHATSAPP_WEBHOOK_BASE_URL") or DEFAULT_WHATSAPP_WEBHOOK_BASE_URL
        ).rstrip("/")
        self.timeout_seconds = timeout_seconds

    def build_flow_webhook_url(self, flow_name: str, node_id: str, secret: str) -> str:
        return f"{self.webhook_base_url}/api/integrations/whatsapp/{flow_name}/{node_id}/events?secret={secret}"

    def _request(self, method: str, path: str, *, token: str | None = None, **kwargs: Any) -> requests.Response:
        headers = dict(kwargs.pop("headers", {}) or {})
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return requests.request(
            method,
            f"{self.base_url}{path}",
            headers=headers,
            timeout=float(kwargs.pop("timeout", self.timeout_seconds)),
            **kwargs,
        )

    def _read_json(self, response: requests.Response) -> Any:
        try:
            return response.json()
        except ValueError:
            return {"raw": response.text}

    def _generate_token(self, session_id: str) -> str:
        response = self._request("POST", f"/api/{session_id}/{self.secret_key}/generate-token")
        response.raise_for_status()
        payload = self._read_json(response)
        token = _recursive_find_first_string(payload, ("token", "access_token", "bearer", "jwt"))
        if not token:
            raise RuntimeError("WPPConnect did not return a session bearer token.")
        return token

    def _clear_session_data(self, session_id: str) -> dict[str, Any]:
        response = self._request("POST", f"/api/{session_id}/{self.secret_key}/clear-session-data")
        response.raise_for_status()
        return self._read_json(response)

    def start_session(self, session_id: str, *, webhook_url: str) -> dict[str, Any]:
        def _start_once(*, token: str) -> tuple[dict[str, Any], dict[str, Any]]:
            response = self._request(
                "POST",
                f"/api/{session_id}/start-session",
                token=token,
                json={
                    "webhook": webhook_url,
                    "waitQrCode": False,
                },
                timeout=max(self.timeout_seconds, 20.0),
            )
            response.raise_for_status()
            payload = self._read_json(response)

            start_qr_code = _normalize_qr_code(_recursive_find_first_string(payload, ("qrcode", "qr", "base64", "data"))) or None
            start_status = _normalize_status(_recursive_find_first_string(payload, ("status", "state", "message")))

            if start_qr_code:
                return {
                    "session_id": session_id,
                    "status": start_status or "qrcode",
                    "connected": False,
                    "qr_code": start_qr_code,
                    "raw": payload,
                    "raw_start_response": payload,
                }, payload

            status = self.get_session_status(session_id, token=token)
            if not status.get("qr_code"):
                status["qr_code"] = self.get_qr_code(session_id, token=token)
            status["raw_start_response"] = payload
            return status, payload

        token = self._generate_token(session_id)
        status, first_payload = _start_once(token=token)

        status_name = _normalize_status(status.get("status", "")).lower()
        needs_fresh_boot = not bool(status.get("connected")) and not bool(status.get("qr_code")) and status_name in {
            "closed",
            "close",
            "disconnected",
            "unknown",
            "notlogged",
        }

        if needs_fresh_boot:
            try:
                clear_payload = self._clear_session_data(session_id)
            except Exception:
                return status

            token = self._generate_token(session_id)
            status, second_payload = _start_once(token=token)
            status["raw"] = {
                "first_start": first_payload,
                "clear_session_data": clear_payload,
                "second_start": second_payload,
            }

        for _ in range(6):
            if bool(status.get("connected")) or bool(status.get("qr_code")):
                return status
            time.sleep(1.5)
            status = self.get_session_status(session_id, token=token)

        if "raw_start_response" not in status:
            status["raw_start_response"] = first_payload

        return status

    def get_qr_code(self, session_id: str, *, token: str | None = None) -> str | None:
        session_token = token or self._generate_token(session_id)
        response = self._request("GET", f"/api/{session_id}/qrcode-session", token=session_token)
        if response.status_code >= 400:
            return None

        content_type = str(response.headers.get("content-type") or "").lower()
        if content_type.startswith("image/"):
            image_bytes = response.content or b""
            if not image_bytes:
                return None
            encoded = base64.b64encode(image_bytes).decode("ascii")
            image_mime = content_type.split(";", 1)[0] or "image/png"
            return f"data:{image_mime};base64,{encoded}"

        payload = self._read_json(response)
        qr_code = _recursive_find_first_string(payload, ("qrcode", "qr", "base64", "data"))
        normalized = _normalize_qr_code(qr_code)
        return normalized or None

    def get_session_status(self, session_id: str, *, token: str | None = None) -> dict[str, Any]:
        session_token = token or self._generate_token(session_id)
        response = self._request("GET", f"/api/{session_id}/status-session", token=session_token)
        response.raise_for_status()
        payload = self._read_json(response)
        status_value = _recursive_find_first_string(payload, ("status", "state", "session", "message"))
        qr_code = _normalize_qr_code(_recursive_find_first_string(payload, ("qrcode", "qr", "base64", "data"))) or None
        if not status_value:
            response_check = self._request("GET", f"/api/{session_id}/check-connection-session", token=session_token)
            if response_check.ok:
                payload_check = self._read_json(response_check)
                status_value = _recursive_find_first_string(payload_check, ("status", "state", "message", "response"))
                if payload_check:
                    payload = {"status": status_value or "unknown", "details": payload, "check": payload_check}
        if not qr_code:
            qr_code = self.get_qr_code(session_id, token=session_token)
        return {
            "session_id": session_id,
            "status": _normalize_status(status_value),
            "connected": _is_connected_status(status_value),
            "qr_code": qr_code,
            "raw": payload,
        }

    def close_session(self, session_id: str) -> dict[str, Any]:
        token = self._generate_token(session_id)
        response = self._request("POST", f"/api/{session_id}/close-session", token=token)
        payload: dict[str, Any]

        if response.ok:
            payload = self._read_json(response)
        else:
            payload = {
                "status": False,
                "message": "Failed to close session cleanly.",
                "close_session_error": response.text,
            }

        try:
            payload["clear_session_data"] = self._clear_session_data(session_id)
            if not response.ok:
                payload["status"] = True
                payload["message"] = "Session data cleared."
        except Exception as clear_error:
            payload["clear_session_data_error"] = str(clear_error)

        return payload

    def send_text(self, session_id: str, *, phone: str, message: str, is_group: bool = False) -> dict[str, Any]:
        token = self._generate_token(session_id)
        response = self._request(
            "POST",
            f"/api/{session_id}/send-message",
            token=token,
            json={
                "phone": phone,
                "message": message,
                "isGroup": bool(is_group),
            },
        )
        response.raise_for_status()
        return self._read_json(response)
