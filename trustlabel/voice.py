"""Spoken answers: one short template sentence per ask result, read aloud by ElevenLabs text-to-speech.

The sentence is built from the graded result only (no model writes it), so the voice never says more than the
screen shows.
"""

from __future__ import annotations

from typing import Protocol

import httpx
from pydantic import Field

from .models import StrictBody

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
# Low-latency model; checked live against GET /v1/models.
TTS_MODEL = "eleven_flash_v2_5"
TTS_OUTPUT_FORMAT = "mp3_44100_64"
MAX_SPEAK_CHARS = 600
TTS_ERRORS = (httpx.HTTPError,)


class SpeakBody(StrictBody):
    text: str = Field(min_length=1, max_length=MAX_SPEAK_CHARS)


class Speaker(Protocol):
    def synthesize(self, text: str) -> bytes: ...


class ElevenLabsSpeaker:
    def __init__(self, api_key: str, voice_id: str, model: str = TTS_MODEL) -> None:
        self._api_key = api_key
        self._voice_id = voice_id
        self._model = model

    def synthesize(self, text: str) -> bytes:
        """MP3 audio for `text`; raises httpx.HTTPError on any upstream failure."""
        response = httpx.post(
            ELEVENLABS_TTS_URL.format(voice_id=self._voice_id),
            params={"output_format": TTS_OUTPUT_FORMAT},
            headers={"xi-api-key": self._api_key, "Accept": "audio/mpeg"},
            json={"text": text, "model_id": self._model},
            timeout=30,
        )
        response.raise_for_status()
        if not response.content:
            raise httpx.HTTPError("Empty audio from text-to-speech")
        return response.content


def _top_source(result: dict) -> dict | None:
    """The source that carries the answer's value, else the best-ranked one."""
    sources = result.get("sources") or []
    value = result["answer"].get("value")
    return next(
        (s for s in sources if s.get("status") == "effective" and s.get("value") == value),
        sources[0] if sources else None,
    )


def _follow_up(result: dict) -> str:
    """Who confirms: the request TrustLabel just sent, one already open, or the best expert to ask."""
    auto = result.get("auto_request")
    if auto:
        return f"I've asked {auto['assignee_name']} to confirm."
    pending = result.get("open_request")
    if pending:
        return f"{pending['assignee_name']} is already checking this."
    experts = result.get("experts") or []
    return f"{experts[0]['name']} can confirm." if experts else "No expert is available to confirm yet."


def speech_for(result: dict) -> str:
    """One short sentence a person can act on, mirroring the verdict shown on screen."""
    restricted = result.get("restricted")
    if restricted:
        contact = restricted.get("contact")
        who = f" Please ask {contact['name']}, {contact['title']}." if contact else ""
        return f"That's not something I can share.{who}"
    if result.get("topic") is None:
        labels = [s["label"] for s in (result.get("suggestions") or [])[:3]]
        hint = f" Try asking about {', '.join(labels[:-1])} or {labels[-1]}." if len(labels) > 1 else ""
        return f"I couldn't match that to a topic I know.{hint}"
    answer = result["answer"]
    status, action = answer["status"], answer["action"]
    if status == "conflict":
        values = [c["value_display"] for c in answer.get("competing") or []][:2]
        disagree = f"sources disagree, {values[0]} or {values[1]}" if len(values) == 2 else "sources disagree"
        return f"Don't act yet: {disagree}. {_follow_up(result)}"
    if status == "gap":
        return f"I have no knowledge that applies to {result['context']['label']}. {_follow_up(result)}"
    source = _top_source(result)
    origin = f", from {source['title']}" if source else ""
    grade = answer.get("grade") or (source["grade"] if source else None)
    graded = f", grade {grade}" if grade else ""
    if action == "use":
        return f"Safe to use: {answer['value_display']}{origin}{graded}."
    return f"Check before you act: {answer['value_display']}{origin}{graded}. {_follow_up(result)}"
