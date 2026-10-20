"""Meeting and phone call recordings as sources: ElevenLabs Scribe with diarization, a job log, a folder watcher.

Recordings arrive by upload or by a synced folder (e.g. Teams meeting recordings in OneDrive/SharePoint; files in its
`calls/` subfolder are phone calls). The app turns each transcript into one graded item through the same extractor and
verbatim-quote check as any capture.
"""

from __future__ import annotations

import logging
import re
import secrets
import threading
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import date, datetime
from pathlib import Path
from typing import Literal

import httpx

from .ai import ELEVENLABS_STT_URL

log = logging.getLogger("trustlabel")

MAX_MEETING_BYTES = 25_000_000
# Multipart framing around the file; the handler enforces MAX_MEETING_BYTES on the file itself.
MAX_MEETING_BODY_BYTES = MAX_MEETING_BYTES + 1_000_000
# Extraction input and stored body: the first part of the transcript, so every stored quote is in the body.
MAX_MEETING_TEXT_CHARS = 12_000
MEETING_SOURCE = "Meeting recording · ElevenLabs Scribe"
CALL_SOURCE = "Phone call · recording (Scribe transcript)"
CALLS_SUBFOLDER = "calls"  # inside the watched folder: recordings here are phone calls
RecordingKind = Literal["meeting", "phone_call"]
MEETINGS_PATH = "/api/meetings"
SCAN_INTERVAL_SECONDS = 15.0
MAX_MEETINGS_IN_FLIGHT = 3  # per uploader
MEETING_LOG_MAX = 500
# Accepted recordings by extension, with the media type sent to Scribe.
MEETING_TYPES = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
}
MeetingStatus = Literal["queued", "transcribing", "done", "failed"]
IN_FLIGHT: frozenset[str] = frozenset({"queued", "transcribing"})


class NoSpeech(ValueError):
    """Scribe returned an empty transcript."""


def media_type(filename: str, declared: str | None) -> str | None:
    """Media type for an accepted recording, or None. The extension decides; a declared type must agree."""
    expected = MEETING_TYPES.get(Path(filename).suffix.lower())
    base = (declared or "").split(";", 1)[0].strip().lower()
    if expected is None or (base and base != "application/octet-stream" and not base.startswith(("audio/", "video/"))):
        return None
    return expected


def meeting_name(filename: str) -> str:
    """Display name from a file name: stem, safe characters only."""
    stem = re.sub(r"[^\w .-]", "", Path(filename).stem).strip(" .-_")
    return re.sub(r"\s+", " ", stem)[:80] or "Recording"


def speaker_transcript(payload: dict) -> str:
    """Scribe diarized response → "Speaker 1: …" lines, speakers numbered in order of appearance."""
    words = payload.get("words") or []
    numbers: dict[str, int] = {}
    lines: list[tuple[int, list[str]]] = []
    for word in words:
        kind = word.get("type")
        text = str(word.get("text", ""))
        if kind == "audio_event":
            continue
        speaker = word.get("speaker_id")
        if kind == "word" and speaker is not None:
            number = numbers.setdefault(str(speaker), len(numbers) + 1)
            if not lines or lines[-1][0] != number:
                lines.append((number, []))
        if lines:
            lines[-1][1].append(text)
    rendered = [f"Speaker {n}: {text}" for n, parts in lines if (text := re.sub(r"\s+", " ", "".join(parts)).strip())]
    return "\n".join(rendered) if rendered else str(payload.get("text", "")).strip()


class ScribeMeetingTranscriber:
    """ElevenLabs Scribe with diarization; returns a speaker-labelled transcript."""

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        response = httpx.post(
            ELEVENLABS_STT_URL,
            headers={"xi-api-key": self._api_key},
            data={"model_id": self._model, "diarize": "true", "tag_audio_events": "false"},
            files={"file": (filename, audio, content_type)},
            timeout=httpx.Timeout(300, connect=15),
        )
        response.raise_for_status()
        return speaker_transcript(response.json())


@dataclass(frozen=True)
class Meeting:
    id: str
    name: str
    owner_id: str
    origin: Literal["upload", "folder"]
    meeting_on: date
    kind: RecordingKind
    created_at: datetime
    status: MeetingStatus = "queued"
    claims: int = 0
    item_id: str | None = None
    error: str | None = None


@dataclass
class MeetingLog:
    """Thread-safe record of meeting jobs, newest last; old finished jobs drop off past MEETING_LOG_MAX."""

    _jobs: dict[str, Meeting] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def add(
        self, name: str, owner_id: str, origin: Literal["upload", "folder"], meeting_on: date, kind: RecordingKind
    ) -> Meeting:
        meeting = Meeting(
            id="MTG-" + secrets.token_hex(4).upper(),
            name=name,
            owner_id=owner_id,
            origin=origin,
            meeting_on=meeting_on,
            kind=kind,
            created_at=datetime.now().astimezone().replace(microsecond=0),
        )
        with self._lock:
            self._jobs[meeting.id] = meeting
            if len(self._jobs) > MEETING_LOG_MAX:
                finished = [m.id for m in self._jobs.values() if m.status not in IN_FLIGHT]
                for old in finished[: len(self._jobs) - MEETING_LOG_MAX]:
                    del self._jobs[old]
        return meeting

    def update(self, meeting_id: str, **changes: object) -> Meeting:
        with self._lock:
            meeting = replace(self._jobs[meeting_id], **changes)
            self._jobs[meeting_id] = meeting
            return meeting

    def for_owner(self, owner_id: str) -> list[Meeting]:
        with self._lock:
            return [m for m in reversed(self._jobs.values()) if m.owner_id == owner_id]

    def in_flight(self, owner_id: str) -> int:
        with self._lock:
            return sum(1 for m in self._jobs.values() if m.owner_id == owner_id and m.status in IN_FLIGHT)


class FolderWatcher:
    """Scans a folder and its `calls/` subfolder for new recordings; a file is handed over once, after its size held
    across two scans. The callback gets the recording's kind: phone_call inside `calls/`, meeting otherwise."""

    SEEN_MAX = 5000

    def __init__(
        self,
        folder: Path,
        on_file: Callable[[Path, float, RecordingKind], None],
        interval: float = SCAN_INTERVAL_SECONDS,
        max_bytes: int = MAX_MEETING_BYTES,
    ) -> None:
        self.folder = folder
        self._on_file = on_file
        self._interval = interval
        self._max_bytes = max_bytes
        self._pending: dict[str, tuple[int, int]] = {}  # relative name → (size, mtime_ns) at the previous scan
        self._seen: set[tuple[str, int, int]] = set()  # (relative name, size, mtime_ns) already handled or skipped
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.last_scan_at: datetime | None = None
        self.last_error: str | None = None
        self.files_processed = 0

    def scan_once(self) -> int:
        handed = 0
        pending: dict[str, tuple[int, int]] = {}
        try:
            entries = self._recordings(self.folder, "meeting")
            calls = self.folder / CALLS_SUBFOLDER
            if calls.is_dir():
                entries += self._recordings(calls, "phone_call")
            self.last_error = None
        except OSError as exc:
            entries = []
            self.last_error = type(exc).__name__
            log.warning("Meetings folder scan failed: %s", self.last_error)
        for path, kind in entries:
            if path.name.startswith("."):
                continue
            try:
                stat = path.stat()
            except OSError:
                continue
            if not path.is_file() or stat.st_size == 0:
                continue
            name = path.relative_to(self.folder).as_posix()
            state = (stat.st_size, stat.st_mtime_ns)
            key = (name, *state)
            if key in self._seen:
                continue
            if stat.st_size > self._max_bytes:
                log.info("Meeting recording %s skipped: %d bytes is over the 25 MB limit", path.name, stat.st_size)
                self._mark_seen(key)
                continue
            if self._pending.get(name) != state:
                pending[name] = state  # new or still growing: wait for one more scan
                continue
            self._mark_seen(key)
            log.info("Recording %s found (%d bytes)", name, stat.st_size)
            try:
                self._on_file(path, stat.st_mtime, kind)
                handed += 1
                self.files_processed += 1
            except Exception as exc:  # one bad file must not stop the watcher
                self.last_error = type(exc).__name__
                log.warning("Meeting recording %s could not be queued: %s", path.name, self.last_error)
        self._pending = pending
        self.last_scan_at = datetime.now().astimezone().replace(microsecond=0)
        return handed

    @staticmethod
    def _recordings(folder: Path, kind: RecordingKind) -> list[tuple[Path, RecordingKind]]:
        return [(p, kind) for p in sorted(folder.iterdir()) if p.suffix.lower() in MEETING_TYPES]

    def _mark_seen(self, key: tuple[str, int, int]) -> None:
        if len(self._seen) >= self.SEEN_MAX:
            self._seen.clear()
        self._seen.add(key)

    def _run(self) -> None:
        while not self._stop.is_set():
            self.scan_once()
            self._stop.wait(self._interval)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="meetings-watcher", daemon=True)
        self._thread.start()
        log.info("Watching %s for meeting recordings every %.0f s", self.folder, self._interval)

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout)
            self._thread = None
