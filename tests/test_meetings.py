import os
import time

from conftest import TODAY, login

from trustlabel.ai import ExtractedClaim
from trustlabel.meetings import FolderWatcher, media_type, speaker_transcript

CUTOFF = "payroll.variables_cutoff"
TRANSCRIPT = "Speaker 1: What about Van Dam?\nSpeaker 2: Van Dam Logistics really has the 25th as cut-off now."


class StubTranscriber:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, int]] = []

    def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        self.calls.append((filename, content_type, len(audio)))
        return TRANSCRIPT


class StubExtractor:
    def extract(self, text, topics, today):
        return [
            ExtractedClaim(topic_id=CUTOFF, value="25", quote="the 25th as cut-off", valid_until=None),
            ExtractedClaim(topic_id=CUTOFF, value="20", quote="the 20th as cut-off", valid_until=None),
        ]


def wait_done(client, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        data = client.get("/api/meetings").json()
        if data["items"] and not data["in_flight"]:
            return data
        time.sleep(0.02)
    raise AssertionError("meeting still in flight")


def find_item(client, item_id):
    return next(i for i in client.app.state.store.items() if i.id == item_id)


def test_upload_becomes_meeting_item_with_verbatim_claims_only(make_client):
    transcriber = StubTranscriber()
    client = make_client(StubExtractor(), meeting_transcriber=transcriber)
    lotte = login(client, "lotte")
    response = lotte.post(
        "/api/meetings", files={"recording": ("Payroll sync.m4a", b"audio-bytes", "audio/x-m4a")}
    )
    assert response.status_code == 202, response.text
    assert response.json()["status"] in ("queued", "transcribing", "done")

    meeting = wait_done(lotte)["items"][0]
    assert (meeting["status"], meeting["claims"], meeting["error"]) == ("done", 1, None)
    assert transcriber.calls == [("Payrollsync.m4a", "audio/mp4", 11)]
    item = find_item(client, meeting["item_id"])
    assert item.kind == "meeting"
    assert item.title == f"Meeting · Payroll sync · {TODAY.isoformat()}"
    assert item.source == "Meeting recording · ElevenLabs Scribe"
    assert (item.author_id, item.owner_id, item.countries, item.client_ids) == ("lotte", "lotte", ["BE"], [])
    assert item.body == TRANSCRIPT
    assert [(c.value, c.quote) for c in item.claims] == [("25", "the 25th as cut-off")]

    # Other users never see someone else's meeting jobs.
    assert login(client, "ellen").get("/api/meetings").json()["items"] == []


def test_upload_rejects_oversize_and_non_audio(make_client):
    client = make_client(StubExtractor(), meeting_transcriber=StubTranscriber())
    lotte = login(client, "lotte")
    too_big = lotte.post("/api/meetings", files={"recording": ("all-hands.mp3", b"x" * 25_000_001, "audio/mpeg")})
    assert too_big.status_code == 413
    text = lotte.post("/api/meetings", files={"recording": ("notes.txt", b"hello", "text/plain")})
    assert text.status_code == 415
    disguised = lotte.post("/api/meetings", files={"recording": ("notes.mp3", b"hello", "text/plain")})
    assert disguised.status_code == 415
    assert lotte.get("/api/meetings").json()["items"] == []


def test_global_body_limit_still_applies_elsewhere(make_client):
    client = make_client(StubExtractor(), StubTranscriber())
    lotte = login(client, "lotte")
    response = lotte.post("/api/capture", content=b"x" * 3_000_001, headers={"Content-Type": "application/json"})
    assert response.status_code == 413


def test_upload_without_scribe_is_503(make_client):
    lotte = login(make_client(StubExtractor()), "lotte")
    response = lotte.post("/api/meetings", files={"recording": ("a.mp3", b"x", "audio/mpeg")})
    assert response.status_code == 503


def test_watcher_processes_a_stable_file_once(make_client, tmp_path):
    transcriber = StubTranscriber()
    client = make_client(
        StubExtractor(), meeting_transcriber=transcriber, meetings_dir=tmp_path, meetings_owner="ellen"
    )
    watcher = client.app.state.meeting_watcher
    recording = tmp_path / "Team call 2026-09-29.mp4"
    recording.write_bytes(b"part")
    (tmp_path / "notes.txt").write_text("not a recording")
    assert watcher.scan_once() == 0  # first sighting
    recording.write_bytes(b"partial-and-more")
    assert watcher.scan_once() == 0  # still growing
    assert watcher.scan_once() == 1  # size held across two scans
    assert watcher.scan_once() == 0  # never twice

    ellen = login(client, "ellen")
    meeting = wait_done(ellen)["items"][0]
    assert (meeting["origin"], meeting["status"], meeting["claims"]) == ("folder", "done", 1)
    item = find_item(client, meeting["item_id"])
    assert (item.kind, item.owner_id, item.countries) == ("meeting", "ellen", ["BE"])
    assert len(transcriber.calls) == 1 and transcriber.calls[0][1] == "video/mp4"
    folder = login(client, "lotte").get("/api/integrations").json()["meetings"]["folder"]
    assert folder["configured"] and folder["files_processed"] == 1


def test_watcher_skips_oversize_files_and_rescans_changed_ones(tmp_path):
    handed: list[str] = []
    watcher = FolderWatcher(tmp_path, lambda path, mtime, kind: handed.append(path.name), max_bytes=10)
    big, small = tmp_path / "big.wav", tmp_path / "small.ogg"
    big.write_bytes(b"x" * 11)
    small.write_bytes(b"x" * 5)
    watcher.scan_once()
    watcher.scan_once()
    assert handed == ["small.ogg"]
    small.write_bytes(b"y" * 6)
    os.utime(small, ns=(time.time_ns(), time.time_ns() + 10_000_000))
    watcher.scan_once()
    watcher.scan_once()
    assert handed == ["small.ogg", "small.ogg"]


def test_unknown_meetings_owner_is_rejected(make_client, tmp_path):
    try:
        make_client(meetings_dir=tmp_path, meetings_owner="nobody")
    except ValueError as exc:
        assert "TRUSTLABEL_MEETINGS_OWNER" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_speaker_transcript_labels_speakers_in_order():
    payload = {
        "text": "Hi there. Hello.",
        "words": [
            {"text": "Hi", "type": "word", "speaker_id": "speaker_3"},
            {"text": " ", "type": "spacing", "speaker_id": "speaker_3"},
            {"text": "there.", "type": "word", "speaker_id": "speaker_3"},
            {"text": " ", "type": "spacing", "speaker_id": "speaker_3"},
            {"text": "(laughs)", "type": "audio_event", "speaker_id": "speaker_0"},
            {"text": "Hello.", "type": "word", "speaker_id": "speaker_0"},
            {"text": " ", "type": "spacing", "speaker_id": "speaker_0"},
            {"text": "Again.", "type": "word", "speaker_id": "speaker_3"},
        ],
    }
    assert speaker_transcript(payload) == "Speaker 1: Hi there.\nSpeaker 2: Hello.\nSpeaker 1: Again."
    assert speaker_transcript({"text": " plain ", "words": []}) == "plain"


def test_media_type_needs_known_extension_and_media_declared_type():
    assert media_type("a.MP3", "audio/mpeg") == "audio/mpeg"
    assert media_type("a.webm", "video/webm") == "audio/webm"
    assert media_type("a.wav", None) == "audio/wav"
    assert media_type("a.flac", "audio/flac") is None
    assert media_type("a.mp4", "application/pdf") is None
