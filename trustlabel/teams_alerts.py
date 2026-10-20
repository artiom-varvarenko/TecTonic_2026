"""Teams expert alerts: a new verification request goes to the routed expert as an Adaptive Card.

The customer creates a Teams workflow in their own tenant ("When a Teams webhook request is received" → "Post card
in a chat or channel"); TrustLabel only POSTs to its URL. The card @mentions the expert, and the top-level
`recipient` lets the workflow post it straight to that expert's chat with the Workflows bot instead.
When the expert answers, a second card tells the asker and the followers. Experts can also answer from Teams:
a Teams Outgoing Webhook (created by a team owner) POSTs "@TrustLabel TL-7F2K 25" to TrustLabel, HMAC-signed.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import html
import re
from collections.abc import Sequence
from typing import Protocol
from urllib.parse import urlsplit

import httpx

from .engine import validate_value
from .models import Topic

# Teams workflow (Power Automate) webhook hosts; anything else is refused so the URL can't be pointed elsewhere.
ALLOWED_HOST_SUFFIXES = (".logic.azure.com", ".api.powerplatform.com")
OUTGOING_PATH = "/api/teams/outgoing"
# A Teams answer carries no date: it is valid as long as the inbox's default, and the note is capped like there.
ANSWER_VALID_DAYS = 180
MAX_NOTE_CHARS = 500
# Failures are logged by class name only: the workflow URL carries its signature as a query parameter.
TEAMS_ERRORS = (httpx.HTTPError,)


def check_workflow_url(url: str) -> str:
    """Return the URL if it is an https Teams workflow webhook, else raise ValueError."""
    url = (url or "").strip()
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise ValueError("Not a Teams workflow webhook URL") from None
    host = (parts.hostname or "").lower()
    if (
        parts.scheme != "https"
        or parts.username is not None
        or parts.password is not None
        or port not in (None, 443)
        or not host.endswith(ALLOWED_HOST_SUFFIXES)
    ):
        raise ValueError("Not a Teams workflow webhook URL")
    return url


def request_card(
    *,
    expert_name: str,
    expert_address: str | None,
    requester_name: str,
    topic_label: str,
    context_label: str,
    question: str,
    candidates: Sequence[tuple[str, str]],
    reasons: Sequence[str],
    open_url: str | None,
    reply_code: str | None = None,
) -> dict:
    """Adaptive Card asking one expert to verify one answer; `candidates` are (value, grade) pairs.

    `reply_code` (set only when the Teams outgoing webhook is configured) adds the "reply in Teams" line.
    """
    who = f"<at>{expert_name}</at>" if expert_address else expert_name
    subject = topic_label[:1].lower() + topic_label[1:]
    claims = " · ".join(f"{value} (grade {grade})" for value, grade in candidates) or "No applicable source yet"
    card: dict = {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {"type": "TextBlock", "text": "TrustLabel · verification request", "weight": "Bolder", "size": "Medium"},
            {
                "type": "TextBlock",
                "text": f"{who}, {requester_name} asks you to verify the {subject} for {context_label}.",
                "wrap": True,
            },
            {
                "type": "FactSet",
                "facts": [
                    {"title": "Question", "value": question},
                    {"title": "Sources say", "value": claims},
                    {"title": "Why you", "value": "; ".join(reasons) or "Top match for this topic"},
                ],
            },
        ],
    }
    if reply_code:
        card["body"].append(
            {
                "type": "TextBlock",
                "text": f"Or reply in Teams: @TrustLabel {reply_code} <your answer>",
                "wrap": True,
                "isSubtle": True,
            }
        )
    if open_url:
        card["actions"] = [{"type": "Action.OpenUrl", "title": "Answer in TrustLabel", "url": open_url}]
    if expert_address:
        card["msteams"] = {
            "entities": [
                {
                    "type": "mention",
                    "text": f"<at>{expert_name}</at>",
                    "mentioned": {"id": expert_address, "name": expert_name},
                }
            ]
        }
    return card


def resolved_card(
    *,
    people: Sequence[tuple[str, str | None]],
    expert_name: str,
    topic_label: str,
    context_label: str,
    value_display: str,
    grade: str,
    note: str,
    open_url: str | None,
) -> tuple[dict, str | None]:
    """Card telling the asker and followers ((name, Teams address or None) pairs) the verified answer.

    Mapped people are @mentioned, the rest named in plain text; returns (card, first mapped address).
    """
    names = [f"<at>{name}</at>" if address else name for name, address in people]
    subject = topic_label[:1].lower() + topic_label[1:]
    lead = f"{', '.join(names)}, " if names else ""
    body: list[dict] = [
        {"type": "TextBlock", "text": "TrustLabel · verified answer", "weight": "Bolder", "size": "Medium"},
        {
            "type": "TextBlock",
            "text": f"{lead}{expert_name} verified the {subject} for {context_label}: {value_display} (grade {grade})",
            "wrap": True,
        },
    ]
    if note:
        body.append({"type": "FactSet", "facts": [{"title": "Note", "value": note}]})
    card: dict = {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": body,
    }
    if open_url:
        card["actions"] = [{"type": "Action.OpenUrl", "title": "Open in TrustLabel", "url": open_url}]
    mentioned = [(name, address) for name, address in people if address]
    if mentioned:
        card["msteams"] = {
            "entities": [
                {"type": "mention", "text": f"<at>{name}</at>", "mentioned": {"id": address, "name": name}}
                for name, address in mentioned
            ]
        }
    return card, (mentioned[0][1] if mentioned else None)


# --- Reply in Teams: a Teams Outgoing Webhook POSTs channel messages that @mention it ---

# No 0/O/1/I: the code is read off a card and typed by hand.
CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
MAX_OUTGOING_BODY_BYTES = 64_000
_REPLY = re.compile(r"(TL-[A-Za-z0-9]{4})(?:\s+(.*))?", re.DOTALL | re.IGNORECASE)
# No `.*?` or `[^>]+` over the body: on 64 KB of unclosed `<at>`/`<` those backtrack quadratically.
_MENTION = re.compile(r"<at>[^<]*</at>", re.IGNORECASE)
_TAG = re.compile(r"<[^<>]+>")


def request_code(verification_id: str) -> str:
    """Short, human-typable code for a verification request, derived from its id (stable across restarts)."""
    digest = hashlib.sha256(verification_id.encode()).digest()
    return "TL-" + "".join(CODE_ALPHABET[b % len(CODE_ALPHABET)] for b in digest[:4])


def outgoing_key(secret: str) -> bytes:
    """The HMAC key Teams shows once when the outgoing webhook is created (base64); raises ValueError."""
    try:
        key = base64.b64decode(secret.strip(), validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("Not a base64 Teams outgoing webhook secret") from None
    if not key:
        raise ValueError("Not a base64 Teams outgoing webhook secret")
    return key


def verify_outgoing(key: bytes, authorization: str | None, body: bytes) -> bool:
    """`Authorization: HMAC <base64(HMAC-SHA256(key, raw body))>`, compared in constant time."""
    scheme, _, signature = (authorization or "").strip().partition(" ")
    if scheme != "HMAC" or not signature:
        return False
    expected = base64.b64encode(hmac.new(key, body, hashlib.sha256).digest()).decode()
    return hmac.compare_digest(expected.encode(), signature.strip().encode())


def message_text(raw: str) -> str:
    """Plain text of a Teams channel message: the @mentions and HTML dropped, whitespace collapsed."""
    text = _TAG.sub(" ", _MENTION.sub(" ", raw or ""))
    return " ".join(html.unescape(text).replace("\xa0", " ").split())


def parse_reply(text: str) -> tuple[str, str] | None:
    """Split "TL-7F2K 25th per addendum" into ("TL-7F2K", "25th per addendum"); None without a leading code."""
    match = _REPLY.fullmatch(text.strip())
    if match is None:
        return None
    return match.group(1).upper(), (match.group(2) or "").strip()


_ORDINAL = re.compile(r"([0-9]{1,2})(?:st|nd|rd|th)", re.IGNORECASE)


def split_answer(topic: Topic, answer: str) -> tuple[str, str]:
    """("25th per addendum") → ("25", "per addendum"): the longest leading value the topic accepts, then the note.

    The value is checked with the same `validate_value` as the inbox; raises its ValueError if none fits.
    """
    tokens = answer.split()
    error = ValueError("Start the answer with the value")
    for n in range(min(3, len(tokens)), 0, -1):
        head = " ".join(tokens[:n]).rstrip(":;,.-–—")
        ordinal = _ORDINAL.fullmatch(head) if topic.value_type == "day_of_month" else None
        if ordinal is not None:
            head = ordinal.group(1)
        try:
            validate_value(topic, head)
        except ValueError as exc:
            error = exc
            continue
        return head, " ".join(tokens[n:]).lstrip("-–—:,; ").strip()
    raise error


def outgoing_reply(text: str) -> dict:
    """Response body Teams posts as the reply in the thread."""
    return {"type": "message", "text": text}


def workflow_payload(card: dict, recipient: str | None) -> dict:
    """The Teams webhook message shape the Workflows templates read (`attachments`), plus the expert's address."""
    return {
        "type": "message",
        "recipient": recipient,
        "attachments": [
            {"contentType": "application/vnd.microsoft.card.adaptive", "contentUrl": None, "content": card}
        ],
    }


class TeamsAlerts(Protocol):
    def send(self, payload: dict) -> None: ...


class HttpTeamsAlerts:
    def __init__(self, url: str, *, timeout: float = 10.0, transport: httpx.BaseTransport | None = None) -> None:
        self._url = check_workflow_url(url)
        self._http = httpx.Client(timeout=timeout, transport=transport, follow_redirects=False)

    def send(self, payload: dict) -> None:
        self._http.post(self._url, json=payload).raise_for_status()

    def close(self) -> None:
        self._http.close()
