"""Spott integration: notes on Spott client records become graded claims; verified answers go back as notes.

Spott (an AI-native recruitment CRM) delivers webhooks through Svix, signed per the Standard Webhooks spec. A
webhook carries only ids, so the note itself is fetched from the REST API and nothing in the payload is trusted.
A note counts only when it is linked to exactly one client, matched by exact name to a TrustLabel client; that
link decides the scope, never a model. Only the sentences stating a kept claim are stored: the rest of a note
(which may describe candidates) never enters TrustLabel. A note starting with `@TrustLabel` or `TrustLabel:` is a
question instead: it is answered with a reply note on the same client and never stored.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import re
import threading
import time
from collections import OrderedDict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime
from html import escape
from html.parser import HTMLParser
from typing import Any, Protocol

import httpx

API_URL = "https://api.gospott.com"
WEBHOOK_PATH = "/api/integrations/spott/webhook"
MAX_WEBHOOK_BYTES = 64 * 1024
SIGNATURE_TOLERANCE_SECONDS = 5 * 60
MAX_NOTE_CHARS = 20_000
MAX_CLIENT_PAGES = 20
# Title prefix of the notes TrustLabel writes, so its own write-backs are never captured again.
NOTE_TITLE_MARKER = "TrustLabel ·"
# Failures of the Spott API or an unexpected response shape: logged, never shown to users.
SPOTT_ERRORS = (httpx.HTTPError, ValueError, KeyError, TypeError)
_ID = re.compile(r"[A-Za-z0-9_-]{1,128}")
_TIMESTAMP = re.compile(r"[0-9]{1,12}")
# A note addressed to TrustLabel asks a question; it is answered, never captured as knowledge.
_QUESTION_PREFIX = re.compile(r"\s*(?:@trustlabel\b|trustlabel:)[\s:,.-]*", re.IGNORECASE)


class WebhookError(Exception):
    """Unsigned, stale or malformed delivery; the endpoint answers without detail."""


def webhook_key(secret: str) -> bytes:
    """HMAC key from the `whsec_…` signing secret shown in Spott → Settings → Webhooks."""
    if not secret.startswith("whsec_"):
        raise ValueError("expected a whsec_… secret")
    try:
        key = base64.b64decode(secret.removeprefix("whsec_"), validate=True)
    except binascii.Error:
        raise ValueError("secret is not base64") from None
    if len(key) < 16:
        raise ValueError("secret is too short")
    return key


def _header(headers: Mapping[str, str], name: str) -> str | None:
    # Svix sends svix-*; the Standard Webhooks names are webhook-*.
    return headers.get(f"webhook-{name}") or headers.get(f"svix-{name}")


def verify_signature(key: bytes, headers: Mapping[str, str], body: bytes, now: float | None = None) -> str:
    """Check one delivery's HMAC-SHA256 signature and timestamp; returns its message id."""
    msg_id, timestamp, signatures = (_header(headers, name) for name in ("id", "timestamp", "signature"))
    if not msg_id or len(msg_id) > 256 or not signatures or not timestamp or not _TIMESTAMP.fullmatch(timestamp):
        raise WebhookError("missing or malformed signature headers")
    if abs((time.time() if now is None else now) - int(timestamp)) > SIGNATURE_TOLERANCE_SECONDS:
        raise WebhookError("timestamp outside tolerance")
    expected = base64.b64encode(hmac.new(key, f"{msg_id}.{timestamp}.".encode() + body, hashlib.sha256).digest())
    for entry in signatures.split():
        version, _, signature = entry.partition(",")
        if version == "v1" and hmac.compare_digest(signature.encode(), expected):
            return msg_id
    raise WebhookError("signature mismatch")


@dataclass(frozen=True)
class NoteEvent:
    note_id: str
    client_ids: tuple[str, ...]


def parse_note_event(body: bytes) -> NoteEvent | None:
    """The `note.created` event in a verified payload; None for every other event."""
    try:
        payload = json.loads(body)
    except ValueError:
        raise WebhookError("payload is not JSON") from None
    if not isinstance(payload, dict):
        raise WebhookError("payload is not an object")
    event = payload.get("event")
    if not isinstance(event, dict) or event.get("name") != "note.created":
        return None
    note_id = payload.get("id")
    if not isinstance(note_id, str) or not _ID.fullmatch(note_id):
        raise WebhookError("malformed note id")
    links = payload.get("links")
    clients = links.get("clients") if isinstance(links, dict) else None
    client_ids = tuple(
        link["id"]
        for link in (clients if isinstance(clients, list) else [])
        if isinstance(link, dict) and isinstance(link.get("id"), str) and _ID.fullmatch(link["id"])
    )
    return NoteEvent(note_id, client_ids)


class _TextParser(HTMLParser):
    _BLOCKS = frozenset(
        {"p", "div", "br", "li", "ul", "ol", "tr", "table", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6"}
    )
    _SKIP = frozenset({"script", "style"})

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skipping = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self._SKIP:
            self._skipping += 1
        elif tag in self._BLOCKS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP:
            self._skipping = max(0, self._skipping - 1)
        elif tag in self._BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skipping:
            self.parts.append(re.sub(r"\s+", " ", data))


def html_to_text(html: str) -> str:
    """Plain text of a note's HTML, one line per block; claims are quoted against this text."""
    parser = _TextParser()
    parser.feed(html)
    parser.close()
    lines = (line.strip() for line in "".join(parser.parts).split("\n"))
    return "\n".join(line for line in lines if line)


def evidence_text(text: str, quotes: Iterable[str]) -> str:
    """Only the sentences that contain a kept quote; the rest of the note is never stored."""
    sentences = [s for s in re.split(r"(?<=[.!?])\s+|\n", text) if s.strip()]
    kept: list[str] = []
    for quote in quotes:
        sentence = next((s for s in sentences if quote in s), quote)
        if sentence not in kept:
            kept.append(sentence)
    return "\n".join(kept)


def question_text(text: str) -> str | None:
    """The question in a note addressed to TrustLabel (`@TrustLabel …` or `TrustLabel: …`); None for other notes."""
    match = _QUESTION_PREFIX.match(text)
    return " ".join(text[match.end() :].split()) if match else None


def note_html(lines: Iterable[str]) -> str:
    """Escaped HTML paragraphs for a Spott note; empty lines are dropped and the first line is bold."""
    paragraphs = [escape(line) for line in lines if line]
    return "".join(f"<p><strong>{p}</strong></p>" if i == 0 else f"<p>{p}</p>" for i, p in enumerate(paragraphs))


@dataclass(frozen=True)
class SpottNote:
    id: str
    title: str
    text: str
    created_on: date
    author_name: str | None
    clients: tuple[tuple[str, str], ...]  # (Spott client id, client name)


def note_from_api(data: Mapping[str, Any]) -> SpottNote:
    author = data.get("createdBy")
    clients = tuple(
        (str(link["client"]["id"]), str(link["client"]["name"]))
        for link in data.get("links") or []
        if isinstance(link, dict) and link.get("entityType") == "client" and isinstance(link.get("client"), dict)
    )
    return SpottNote(
        id=str(data["id"]),
        title=str(data.get("title") or "").strip(),
        text=html_to_text(str(data.get("content") or ""))[:MAX_NOTE_CHARS],
        created_on=datetime.fromisoformat(str(data["createdAt"])).date(),
        author_name=str(author["name"]) if isinstance(author, dict) and author.get("name") else None,
        clients=clients,
    )


class SpottApi(Protocol):
    def get_note(self, note_id: str) -> SpottNote: ...

    def find_client_id(self, name: str) -> str | None: ...

    def add_client_note(self, client_id: str, title: str, html: str) -> str: ...

    def count_users(self) -> int: ...


class HttpSpottApi:
    """Spott REST API with one workspace API key."""

    def __init__(self, api_key: str, base_url: str = API_URL) -> None:
        self._http = httpx.Client(
            base_url=base_url, headers={"x-api-key": api_key, "accept": "application/json"}, timeout=15
        )

    def get_note(self, note_id: str) -> SpottNote:
        if not _ID.fullmatch(note_id):
            raise ValueError("malformed note id")
        response = self._http.get(f"/notes/{note_id}")
        response.raise_for_status()
        return note_from_api(response.json())

    def find_client_id(self, name: str) -> str | None:
        wanted = name.strip().casefold()
        cursor: str | None = None
        for _ in range(MAX_CLIENT_PAGES):
            response = self._http.get("/clients", params={"limit": 50} | ({"cursor": cursor} if cursor else {}))
            response.raise_for_status()
            data = response.json()
            for client in data["items"]:
                label = client.get("name")
                label = label.get("name") if isinstance(label, dict) else label
                if isinstance(label, str) and label.strip().casefold() == wanted:
                    return str(client["id"])
            cursor = (data.get("pageInfo") or {}).get("nextCursor")
            if not cursor:
                break
        return None

    def add_client_note(self, client_id: str, title: str, html: str) -> str:
        response = self._http.post(
            "/notes",
            json={"title": title, "content": html, "links": [{"entityType": "client", "entityId": client_id}]},
        )
        response.raise_for_status()
        return str(response.json()["id"])

    def count_users(self) -> int:
        """Users in the workspace; the call also proves the API key works."""
        response = self._http.get("/users")
        response.raise_for_status()
        users = response.json()["users"]
        if not isinstance(users, list):
            raise ValueError("unexpected users payload")
        return len(users)

    def close(self) -> None:
        self._http.close()


class SeenIds:
    """Bounded memory of webhook message ids, so a redelivered message is processed once."""

    def __init__(self, limit: int = 4096) -> None:
        self._ids: OrderedDict[str, None] = OrderedDict()
        self._limit = limit
        self._lock = threading.Lock()

    def add(self, msg_id: str) -> bool:
        """True the first time an id is seen."""
        with self._lock:
            if msg_id in self._ids:
                return False
            self._ids[msg_id] = None
            if len(self._ids) > self._limit:
                self._ids.popitem(last=False)
            return True
