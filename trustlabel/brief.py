"""Channel briefs: which client an email or case is about, the reply a person may send, the case-comment text.

Every channel (Outlook, Salesforce) shares this core: rules pick the client and topic, the engine labels the
answer, and the reply is a fixed template around the labelled value. Nothing here sends anything to a client.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from .models import Client, Topic

ACTION_LABELS = {"use": "Safe to use", "verify": "Use with caution", "ask_expert": "Don't act yet"}


def sender_domain(sender: str | None) -> str | None:
    """Lowercased domain of `a@b.c` or `Name <a@b.c>`, or None."""
    _, at, domain = (sender or "").strip().rpartition("@")
    domain = domain.strip().rstrip(">").strip().lower()
    return domain if at and domain else None


def plain_text(*parts: str) -> str:
    """Parts joined by single ASCII spaces; mail clients mix in non-breaking spaces and line breaks."""
    return " ".join(" ".join(parts).split())


def mentions(text: str, name: str) -> bool:
    """Case-insensitive whole-word mention, so `Van Dam` does not match `Van Damme`.

    Words may be separated by any whitespace: mail clients send non-breaking spaces and line breaks.
    """
    words = name.split()
    if not words:
        return False
    pattern = r"\s+".join(map(re.escape, words))
    return re.search(rf"(?<!\w){pattern}(?!\w)", text, re.IGNORECASE) is not None


def detect_client(text: str, sender: str | None, candidates: Sequence[Client]) -> tuple[Client | None, str | None]:
    """The one candidate the sender's email domain belongs to, else the one named in the text; never a guess.

    Returns (client, "email_domain" | "name"), or (None, None) when nothing or more than one candidate fits.
    """
    domain = sender_domain(sender)
    if domain:
        owners = [c for c in candidates if any(domain == d or domain.endswith("." + d) for d in c.email_domains)]
        if len(owners) == 1:
            return owners[0], "email_domain"
    named = [c for c in candidates if any(mentions(text, n) for n in (c.name, *c.aliases) if n.strip())]
    if len(named) == 1:
        return named[0], "name"
    return None, None


def reply_for(
    action: str, topic: Topic, value_display: str | None, client_name: str | None, signature: str | None
) -> dict:
    """Reply text built only from the labelled answer: the value when it is safe, a holding reply otherwise."""
    subject = topic.label[:1].lower() + topic.label[1:]
    scope = f" for {client_name}" if client_name else ""
    value = f"the {value_display}" if topic.value_type == "day_of_month" else value_display
    if action == "use" and value_display:
        kind, text = "answer", f"The {subject}{scope} is {value}."
    elif action == "verify" and value_display:
        kind, text = (
            "answer",
            (
                f"Based on our current information, the {subject}{scope} is {value}. "
                "I am confirming this with our specialist and will let you know if anything changes."
            ),
        )
    else:
        kind, text = (
            "holding",
            (
                f"Thank you for your question about the {subject}{scope}. "
                "I am confirming the exact answer with our specialist and will come back to you as soon as possible."
            ),
        )
    closing = f"Kind regards,\n{signature}" if signature else "Kind regards,"
    return {"kind": kind, "text": f"Hello,\n\n{text}\n\n{closing}"}


def brief_text(brief: dict) -> str:
    """Plain-text rendering of a brief (same shape as POST /api/v1/brief) for an internal case comment."""
    answer = brief["answer"]
    label = ACTION_LABELS[answer["action"]]
    headline = answer["headline"]
    lines = [
        f"TrustLabel · {brief['topic']['label']} · {brief['context_label']}",
        headline if headline.startswith(label) else f"{label}: {headline}",
        answer["detail"],
    ]
    if brief["sources"]:
        lines += ["", "Sources:"]
        lines += [
            f"- {s['value_display']} · grade {s['grade']} · {s['kind_label']}: {s['title']}" for s in brief["sources"]
        ]
    expert = brief["expert"]
    if expert:
        reasons = f" ({'; '.join(expert['reasons'])})" if expert["reasons"] else ""
        lines += ["", f"Who can verify: {expert['name']}, {expert['title']}{reasons}"]
    reply = brief["reply"]
    if reply:
        lines += ["", "Suggested holding reply:" if reply["kind"] == "holding" else "Suggested reply:", reply["text"]]
    lines += ["", "Internal note from TrustLabel. Nothing was sent to the client."]
    return "\n".join(lines)


def unscoped_case_text(topic: Topic) -> str:
    """Case comment when the topic is clear but the client is not: answers differ per client, so none is given."""
    return "\n".join(
        [
            f"TrustLabel · {topic.label}",
            "Don't act yet: TrustLabel can't tell which client this case is about, and the answer differs per client.",
            "Ask TrustLabel for the right client (web app or Teams) before replying.",
            "",
            "Internal note from TrustLabel. Nothing was sent to the client.",
        ]
    )
