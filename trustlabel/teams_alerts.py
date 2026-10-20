"""Teams expert alerts: a new verification request goes to the routed expert as an Adaptive Card.

The customer creates a Teams workflow in their own tenant ("When a Teams webhook request is received" → "Post card
in a chat or channel"); TrustLabel only POSTs to its URL. The card @mentions the expert, and the top-level
`recipient` lets the workflow post it straight to that expert's chat with the Workflows bot instead.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol
from urllib.parse import urlsplit

import httpx

# Teams workflow (Power Automate) webhook hosts; anything else is refused so the URL can't be pointed elsewhere.
ALLOWED_HOST_SUFFIXES = (".logic.azure.com", ".api.powerplatform.com")
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
) -> dict:
    """Adaptive Card asking one expert to verify one answer; `candidates` are (value, grade) pairs."""
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
