from conftest import TODAY, login
from test_meetings import StubExtractor, StubTranscriber, find_item, wait_done

from trustlabel.meetings import FolderWatcher


def upload(client, kind=None, name="Client call.m4a"):
    data = {"kind": kind} if kind is not None else None
    return client.post("/api/meetings", files={"recording": (name, b"audio-bytes", "audio/x-m4a")}, data=data)


def test_phone_call_upload_becomes_phone_call_item(make_client):
    client = make_client(StubExtractor(), meeting_transcriber=StubTranscriber())
    lotte = login(client, "lotte")
    response = upload(lotte, "phone_call")
    assert response.status_code == 202, response.text
    assert response.json()["kind"] == "phone_call"

    job = wait_done(lotte)["items"][0]
    assert (job["kind"], job["status"], job["claims"]) == ("phone_call", "done", 1)
    item = find_item(client, job["item_id"])
    assert item.kind == "phone_call"
    assert item.title == f"Call · Client call · {TODAY.isoformat()}"
    assert item.source == "Phone call · recording (Scribe transcript)"
    assert [c.quote for c in item.claims] == ["the 25th as cut-off"]


def test_upload_defaults_to_meeting(make_client):
    client = make_client(StubExtractor(), meeting_transcriber=StubTranscriber())
    lotte = login(client, "lotte")
    assert upload(lotte).status_code == 202
    job = wait_done(lotte)["items"][0]
    assert job["kind"] == "meeting"
    item = find_item(client, job["item_id"])
    assert (item.kind, item.title) == ("meeting", f"Meeting · Client call · {TODAY.isoformat()}")
    assert item.source == "Meeting recording · ElevenLabs Scribe"


def test_invalid_kind_is_422(make_client):
    transcriber = StubTranscriber()
    lotte = login(make_client(StubExtractor(), meeting_transcriber=transcriber), "lotte")
    for kind in ("email", "voicemail", "PHONE_CALL"):
        assert upload(lotte, kind).status_code == 422
    assert lotte.get("/api/meetings").json()["items"] == []
    assert transcriber.calls == []


def test_calls_subfolder_files_are_phone_calls(make_client, tmp_path):
    client = make_client(
        StubExtractor(), meeting_transcriber=StubTranscriber(), meetings_dir=tmp_path, meetings_owner="ellen"
    )
    watcher = client.app.state.meeting_watcher
    (tmp_path / "calls").mkdir()
    (tmp_path / "calls" / "Supplier call.mp3").write_bytes(b"call-audio")
    (tmp_path / "Weekly sync.mp3").write_bytes(b"meeting-audio")
    assert watcher.scan_once() == 0
    assert watcher.scan_once() == 2
    assert watcher.scan_once() == 0

    ellen = login(client, "ellen")
    jobs = {j["name"]: j for j in wait_done(ellen)["items"]}
    assert len(jobs) == 2
    call, meeting = jobs["Supplier call"], jobs["Weekly sync"]
    assert (call["kind"], call["origin"], meeting["kind"]) == ("phone_call", "folder", "meeting")
    call_item = find_item(client, call["item_id"])
    assert call_item.kind == "phone_call" and call_item.title.startswith("Call · Supplier call · ")
    assert find_item(client, meeting["item_id"]).kind == "meeting"


def test_watcher_keys_same_name_in_calls_separately(tmp_path):
    handed: list[tuple[str, str]] = []
    watcher = FolderWatcher(tmp_path, lambda path, mtime, kind: handed.append((path.parent.name, kind)))
    (tmp_path / "calls").mkdir()
    (tmp_path / "a.wav").write_bytes(b"x")
    (tmp_path / "calls" / "a.wav").write_bytes(b"x")
    watcher.scan_once()
    watcher.scan_once()
    assert sorted(handed) == [("calls", "phone_call"), (tmp_path.name, "meeting")]
