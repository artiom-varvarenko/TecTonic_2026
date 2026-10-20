"""Claude drafts the question TrustLabel sends to an expert; rules check it, a template stands in when it fails.

The draft may only restate what TrustLabel already knows (context, topic, competing values with their source and
grade). A draft that is not one short line, drops a candidate value or introduces a number that is not in the facts
is discarded for the deterministic template, which is also what runs when no Anthropic key is configured.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
MAX_QUESTION_CHARS = 300
CLAUDE_ERRORS = (httpx.HTTPError, ValueError, KeyError, TypeError)

SYSTEM_PROMPT = (
    "You write the one question a colleague sends to an internal expert to verify a fact, as a short Teams message. "
    "Write exactly one neutral question, on a single line, at most 300 characters, in English, phrased naturally "
    "(for example: 'For Van Dam Logistics NV (BE), is the payroll cut-off the 20th of the month (Procedure X, grade C) "
    "or the 25th of the month (Teams message Y, grade D)?'). Never use labels such as 'Context:' or 'Topic:'. "
    "Mention the context and the topic, and every candidate value exactly as written, each with its source title and "
    "grade. Do not favour a value, do not add facts, numbers, dates, names or advice that are not in the input. "
    "If there are no candidates, ask what the value is and say no current source covers it. "
    "Reply with the question only, no quotes and no preamble."
)


@dataclass(frozen=True)
class DraftCandidate:
    value_display: str
    title: str
    grade: str


def _distinct(candidates: Sequence[DraftCandidate]) -> list[DraftCandidate]:
    """One candidate per value, the best-graded source first (candidates arrive best first)."""
    seen: dict[str, DraftCandidate] = {}
    for c in candidates:
        seen.setdefault(c.value_display, c)
    return list(seen.values())


def _lower_first(label: str) -> str:
    return label[:1].lower() + label[1:]


def template_question(context: str, topic: str, candidates: Sequence[DraftCandidate]) -> str:
    """Deterministic question: a gap, one value to confirm, or the competing values side by side."""
    values = _distinct(candidates)
    subject = _lower_first(topic)
    if not values:
        return f"What is the {subject} for {context}? No current source covers it."
    listed = [f"{c.value_display} ({c.title}, grade {c.grade})" for c in values]
    if len(listed) == 1:
        return f"Is the {subject} for {context} still {listed[0]}?"
    return f"Which is right for {context}: {subject} {', '.join(listed[:-1])} or {listed[-1]}?"


def _numbers(text: str) -> set[str]:
    return set(re.findall(r"\d+", text))


def check_draft(draft: str, context: str, topic: str, candidates: Sequence[DraftCandidate]) -> str | None:
    """The draft if it is one line ≤ 300 chars, names every value and adds no number; else None."""
    text = draft.strip().strip('"').strip()
    if not text or "\n" in text or "\r" in text or len(text) > MAX_QUESTION_CHARS:
        return None
    values = _distinct(candidates)
    if any(c.value_display not in text for c in values):
        return None
    facts = " ".join([context, topic, *(f"{c.value_display} {c.title} {c.grade}" for c in values)])
    if not _numbers(text) <= _numbers(facts):
        return None
    return text


class ClaudeClient:
    def __init__(
        self, api_key: str, model: str, transport: httpx.BaseTransport | None = None, *, timeout: float = 15.0
    ) -> None:
        self._model = model
        self._http = httpx.Client(
            timeout=timeout,
            transport=transport,
            follow_redirects=False,
            headers={"x-api-key": api_key, "anthropic-version": ANTHROPIC_VERSION},
        )

    def _complete(self, prompt: str) -> str:
        response = self._http.post(
            MESSAGES_URL,
            json={
                "model": self._model,
                "max_tokens": 200,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        response.raise_for_status()
        blocks = response.json()["content"]
        return "".join(b["text"] for b in blocks if b.get("type") == "text")

    def draft_question(self, context: str, topic: str, candidates: Sequence[DraftCandidate]) -> str:
        """Claude's draft when it passes `check_draft`, otherwise the template."""
        values = _distinct(candidates)
        lines = [f"Context: {context}", f"Topic: {topic}"]
        lines += [f"Candidate: {c.value_display} | source: {c.title} | grade {c.grade}" for c in values] or [
            "Candidates: none (no current source covers it)"
        ]
        try:
            draft = check_draft(self._complete("\n".join(lines)), context, topic, values)
        except CLAUDE_ERRORS as exc:
            logger.warning("Claude draft failed: %s", type(exc).__name__)
            draft = None
        else:
            if draft is None:
                logger.warning("Claude draft rejected by checks; using the template")
        return draft or template_question(context, topic, values)

    def close(self) -> None:
        self._http.close()
