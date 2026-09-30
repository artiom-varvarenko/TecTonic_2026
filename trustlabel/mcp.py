"""Remote MCP server plumbing (Streamable HTTP, stateless, JSON-only) and Teams connection tokens.

The FastAPI app owns authentication and the business logic; this module owns the JSON-RPC envelope,
tool catalogue, argument validation, plain-text summaries and the hashed token registry.
"""

from __future__ import annotations

import hashlib
import secrets
import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

MCP_PATH = "/mcp"
MAX_MCP_BODY_BYTES = 64 * 1024
TOKEN_PREFIX = "tlk_"
TOKEN_TTL = timedelta(hours=8)
MCP_CALLS_PER_WINDOW = 60
MCP_WINDOW_SECONDS = 600
SUPPORTED_PROTOCOL_VERSIONS = frozenset({"2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"})
DEFAULT_PROTOCOL_VERSION = "2025-06-18"

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
UNAUTHORIZED = -32001

SERVER_INFO = {"name": "trustlabel", "title": "TrustLabel", "version": "1.0.0"}
INSTRUCTIONS = (
    "TrustLabel grades every internal knowledge source from A (expert-verified) to G (contradicted) and "
    "says whether it applies to the user's country and client. Call ask_trustlabel before relying on "
    "payroll or HR procedure knowledge. Never act on an answer graded D-G, or when sources conflict, "
    "without verification: call request_verification to route the question to the best-qualified expert."
)


class RpcError(Exception):
    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def rpc_result(request_id: Any, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def rpc_error(request_id: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


@dataclass(frozen=True)
class Envelope:
    id: Any
    method: str | None  # None for JSON-RPC responses sent by the client
    params: dict

    @property
    def expects_response(self) -> bool:
        return self.method is not None and self.id is not None


def parse_envelope(message: Any) -> Envelope:
    """Validate one JSON-RPC 2.0 message; batches and malformed envelopes raise INVALID_REQUEST."""
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        raise RpcError(INVALID_REQUEST, "Invalid Request")
    has_id = "id" in message
    request_id = message.get("id")
    if has_id and (isinstance(request_id, bool) or not isinstance(request_id, (str, int))):
        raise RpcError(INVALID_REQUEST, "Invalid Request")
    method = message.get("method")
    if method is None and has_id and ("result" in message or "error" in message):
        return Envelope(None, None, {})
    params = message.get("params", {})
    if not isinstance(method, str) or not method or not isinstance(params, dict):
        raise RpcError(INVALID_REQUEST, "Invalid Request")
    return Envelope(request_id if has_id else None, method, params)


class _ToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class AskArgs(_ToolArgs):
    question: str = Field(min_length=1, max_length=300)
    client: str | None = Field(default=None, max_length=100)


class VerificationArgs(AskArgs):
    pass


class CaptureArgs(_ToolArgs):
    text: str = Field(min_length=1, max_length=1000)
    client: str | None = Field(default=None, max_length=100)


_CLIENT_SCHEMA = {
    "type": "string",
    "maxLength": 100,
    "description": "Client id or part of the client name from your portfolio. Omit for your country-wide context.",
}


@dataclass(frozen=True)
class ToolSpec:
    definition: dict
    args_model: type[_ToolArgs]


TOOLS: dict[str, ToolSpec] = {
    "ask_trustlabel": ToolSpec(
        {
            "name": "ask_trustlabel",
            "title": "Ask TrustLabel",
            "description": (
                "Answer an internal payroll/HR procedure question with trust labels: every source gets an "
                "A-G grade with reasons, an applicability verdict for the client/country, conflict triage "
                "and the best expert to verify with."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "question": {"type": "string", "minLength": 1, "maxLength": 300},
                    "client": _CLIENT_SCHEMA,
                },
                "required": ["question"],
                "additionalProperties": False,
            },
            "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False},
        },
        AskArgs,
    ),
    "request_verification": ToolSpec(
        {
            "name": "request_verification",
            "title": "Request expert verification",
            "description": (
                "Route the question to the best-qualified expert for this topic and client. Reuses your "
                "open request for the same context. Use when TrustLabel says to verify or ask an expert."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "question": {"type": "string", "minLength": 1, "maxLength": 300},
                    "client": _CLIENT_SCHEMA,
                },
                "required": ["question"],
                "additionalProperties": False,
            },
            "annotations": {"readOnlyHint": False, "destructiveHint": False, "openWorldHint": False},
        },
        VerificationArgs,
    ),
    "capture_teams_message": ToolSpec(
        {
            "name": "capture_teams_message",
            "title": "Capture a Teams message",
            "description": (
                "Capture a Teams message as a knowledge source. Only claims quoted verbatim from the text "
                "are kept; each is graded and conflict-checked against the existing sources."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "minLength": 1, "maxLength": 1000},
                    "client": _CLIENT_SCHEMA,
                },
                "required": ["text"],
                "additionalProperties": False,
            },
            "annotations": {"readOnlyHint": False, "destructiveHint": False, "openWorldHint": False},
        },
        CaptureArgs,
    ),
}


def parse_tool_call(params: dict, available: list[str]) -> tuple[str, _ToolArgs]:
    name = params.get("name")
    if not isinstance(name, str) or name not in available:
        raise RpcError(INVALID_PARAMS, "Unknown tool")
    arguments = params.get("arguments", {})
    if arguments is None:
        arguments = {}
    if not isinstance(arguments, dict):
        raise RpcError(INVALID_PARAMS, "Tool arguments must be an object")
    try:
        return name, TOOLS[name].args_model.model_validate(arguments)
    except ValidationError as exc:
        # Describe what is wrong without echoing the submitted values.
        problems = "; ".join(
            f"{'.'.join(str(p) for p in err['loc']) or 'arguments'}: {err['msg']}" for err in exc.errors()
        )
        raise RpcError(INVALID_PARAMS, f"Invalid arguments: {problems}") from None


def handle_request(
    envelope: Envelope,
    *,
    tools: list[str],
    call_tool: Callable[[str, _ToolArgs], dict],
) -> dict:
    """Answer one JSON-RPC request (not a notification) with a result or error envelope."""
    try:
        if envelope.method == "initialize":
            requested = envelope.params.get("protocolVersion")
            version = requested if requested in SUPPORTED_PROTOCOL_VERSIONS else DEFAULT_PROTOCOL_VERSION
            return rpc_result(
                envelope.id,
                {
                    "protocolVersion": version,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": SERVER_INFO,
                    "instructions": INSTRUCTIONS,
                },
            )
        if envelope.method == "ping":
            return rpc_result(envelope.id, {})
        if envelope.method == "tools/list":
            return rpc_result(envelope.id, {"tools": [TOOLS[name].definition for name in tools]})
        if envelope.method == "tools/call":
            name, args = parse_tool_call(envelope.params, tools)
            return rpc_result(envelope.id, call_tool(name, args))
        raise RpcError(METHOD_NOT_FOUND, "Method not found")
    except RpcError as exc:
        return rpc_error(envelope.id, exc.code, exc.message)


def tool_result(text: str, structured: dict) -> dict:
    return {"content": [{"type": "text", "text": text}], "structuredContent": structured, "isError": False}


def tool_error(message: str) -> dict:
    return {"content": [{"type": "text", "text": message}], "isError": True}


_ACTION_ADVICE = {
    "use": "Safe to use.",
    "verify": "Use with caution — request verification before acting (request_verification).",
    "ask_expert": "Don't act yet — ask an expert to verify (request_verification).",
}


def no_topic_text(suggestions: list[dict]) -> str:
    return "No matching topic. Try: " + ", ".join(t["label"] for t in suggestions)


def ask_summary(result: dict) -> str:
    """Plain-text rendering of `build_ask_result` for chat surfaces without structured rendering."""
    answer = result["answer"]
    lines = [answer["headline"], answer["detail"], f"Context: {result['context']['label']}", "Sources:"]
    lines += [
        f"{s['grade']} {s['score']} {s['id']} {s['title']} — {s['applicability']['text']}"
        for s in result["sources"]
    ]
    experts = result["experts"]
    if experts:
        top = experts[0]
        lines.append(f"Top expert: {top['name']} ({top['title']}) — {'; '.join(top['reasons'])}")
    else:
        lines.append("Top expert: none available")
    pending = result.get("open_request")
    if pending:
        lines.append(f"Verification requested from {pending['assignee_name']} — pending.")
    else:
        lines.append(_ACTION_ADVICE[answer["action"]])
    return "\n".join(lines)


def verification_summary(view: dict, created: bool) -> str:
    if created:
        return (
            f"Verification request sent to {view['assignee_name']} for {view['context_label']} "
            f"({view['topic']['label']}). Ask again once they confirm to get the verified answer."
        )
    return (
        f"You already have an open verification request with {view['assignee_name']} for "
        f"{view['context_label']} ({view['topic']['label']}); it is still pending."
    )


def bearer_token(headers: Mapping[str, str]) -> str | None:
    """Token from `Authorization: Bearer …` or `X-API-Key`; cookies are never consulted."""
    authorization = headers.get("authorization")
    if authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer" and value.strip():
            return value.strip()
    api_key = headers.get("x-api-key")
    return api_key.strip() if api_key and api_key.strip() else None


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass(frozen=True)
class ConnectionRecord:
    user_id: str
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None = None
    calls: int = 0


class ConnectionTokens:
    """One active Teams connection token per user; only SHA-256 digests are kept in memory."""

    def __init__(self, now: Callable[[], datetime] = lambda: datetime.now().astimezone()) -> None:
        self._now = now
        self._records: dict[str, ConnectionRecord] = {}
        self._lock = threading.Lock()

    def _drop_expired(self, now: datetime) -> None:
        for digest in [d for d, r in self._records.items() if r.expires_at <= now]:
            del self._records[digest]

    def _revoke(self, user_id: str) -> None:
        for digest in [d for d, r in self._records.items() if r.user_id == user_id]:
            del self._records[digest]

    def issue(self, user_id: str) -> tuple[str, ConnectionRecord]:
        """Revoke the user's previous token and return a new plaintext token (shown once)."""
        token = TOKEN_PREFIX + secrets.token_urlsafe(32)
        with self._lock:
            now = self._now().replace(microsecond=0)
            self._drop_expired(now)
            self._revoke(user_id)
            record = ConnectionRecord(user_id, now, now + TOKEN_TTL)
            self._records[_digest(token)] = record
            return token, record

    def revoke(self, user_id: str) -> None:
        with self._lock:
            self._revoke(user_id)

    def status(self, user_id: str) -> ConnectionRecord | None:
        with self._lock:
            self._drop_expired(self._now())
            return next((r for r in self._records.values() if r.user_id == user_id), None)

    def authenticate(self, token: str | None) -> str | None:
        """Return the token's user id and record the use, or None for unknown/expired tokens."""
        if not token or not token.startswith(TOKEN_PREFIX) or len(token) > 128:
            return None
        digest = _digest(token)
        with self._lock:
            now = self._now()
            self._drop_expired(now)
            record = self._records.get(digest)
            if record is None:
                return None
            self._records[digest] = replace(
                record, last_used_at=now.replace(microsecond=0), calls=record.calls + 1
            )
            return record.user_id


def connection_view(record: ConnectionRecord | None) -> dict:
    def iso(value: datetime | None) -> str | None:
        return value.isoformat(timespec="seconds") if value else None

    return {
        "connected": record is not None,
        "created_at": iso(record.created_at) if record else None,
        "expires_at": iso(record.expires_at) if record else None,
        "last_used_at": iso(record.last_used_at) if record else None,
        "calls": record.calls if record else 0,
        "mcp_path": MCP_PATH,
    }
