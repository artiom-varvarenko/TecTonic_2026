import httpx
from conftest import login

from trustlabel.voice import speech_for

QUESTION = "What's the cut-off for submitting overtime this month?"


class StubTranscriber:
    def __init__(self, text: str = QUESTION) -> None:
        self.text = text
        self.calls = 0

    def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        self.calls += 1
        return self.text


class StubSpeaker:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.texts: list[str] = []

    def synthesize(self, text: str) -> bytes:
        if self.fail:
            raise httpx.HTTPStatusError(
                "upstream", request=httpx.Request("POST", "https://x"), response=httpx.Response(500, text="secret")
            )
        self.texts.append(text)
        return b"ID3-fake-mp3"


def voice_ask(user_client, audio=b"voice-bytes", content_type="audio/webm", **form):
    return user_client.post(
        "/api/voice/ask", files={"audio": ("q.webm", audio, content_type)}, data={"client_id": "vandam", **form}
    )


def test_voice_ask_returns_transcript_same_result_as_typed_ask_and_speech(make_client):
    transcriber = StubTranscriber()
    lotte = login(make_client(transcriber=transcriber, speaker=StubSpeaker()), "lotte")

    response = voice_ask(lotte)
    assert response.status_code == 200, response.text
    body = response.json()
    typed = lotte.post("/api/ask", json={"question": QUESTION, "client_id": "vandam"}).json()
    assert body["transcript"] == QUESTION
    assert body["result"] == typed
    assert body["result"]["answer"]["status"] == "conflict"
    assert body["speech"].startswith("Don't act yet: sources disagree, ")
    assert body["speech"].endswith("can confirm.")


def test_voice_ask_guards(make_client):
    client = make_client(transcriber=StubTranscriber(), speaker=StubSpeaker())
    assert voice_ask(client).status_code == 401
    lotte = login(client, "lotte")
    assert voice_ask(lotte, content_type="text/plain").status_code == 415
    assert voice_ask(lotte, audio=b"x" * 2_000_001).status_code == 413
    assert voice_ask(lotte, client_id="noordhaven").status_code == 403
    assert voice_ask(login(make_client(), "lotte")).status_code == 503


def test_speak_returns_uncached_audio_and_validates_text(make_client):
    speaker = StubSpeaker()
    client = make_client(speaker=speaker)
    assert client.post("/api/voice/speak", json={"text": "Hello"}).status_code == 401

    lotte = login(client, "lotte")
    response = lotte.post("/api/voice/speak", json={"text": "Safe to use: the 25th."})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.headers["cache-control"] == "no-store"
    assert response.content == b"ID3-fake-mp3"
    assert speaker.texts == ["Safe to use: the 25th."]

    assert lotte.post("/api/voice/speak", json={"text": "x" * 601}).status_code == 422
    assert lotte.post("/api/voice/speak", json={"text": "   "}).status_code == 422
    assert speaker.texts == ["Safe to use: the 25th."]


def test_speak_maps_missing_config_and_upstream_errors(make_client):
    unconfigured = login(make_client(), "lotte").post("/api/voice/speak", json={"text": "Hi"})
    assert unconfigured.status_code == 503
    assert "ElevenLabs" in unconfigured.json()["detail"]

    failed = login(make_client(speaker=StubSpeaker(fail=True)), "lotte").post("/api/voice/speak", json={"text": "Hi"})
    assert failed.status_code == 502
    assert "secret" not in failed.text


def test_csp_allows_blob_audio(make_client):
    csp = make_client().get("/").headers["content-security-policy"]
    assert "media-src 'self' blob:" in csp


def _result(status, action, **answer):
    return {
        "topic": {"id": "t", "label": "T"},
        "context": {"label": "Van Dam Logistics (BE)"},
        "answer": {"status": status, "action": action, "value": "25", "value_display": "the 25th", **answer},
        "sources": [{"title": "Payroll calendar", "status": "effective", "value": "25", "grade": "A"}],
        "experts": [{"name": "Ellen Maes"}],
        "open_request": None,
    }


def test_speech_templates():
    assert speech_for(_result("verified", "use", grade="A")) == "Safe to use: the 25th, from Payroll calendar, grade A."
    conflict = _result(
        "conflict", "ask_expert", competing=[{"value_display": "the 25th"}, {"value_display": "the 20th"}]
    )
    assert speech_for(conflict) == "Don't act yet: sources disagree, the 25th or the 20th. Ellen Maes can confirm."
    conflict["auto_request"] = {"assignee_name": "Ellen Maes"}
    assert speech_for(conflict).endswith("I've asked Ellen Maes to confirm.")
    gap = speech_for(_result("gap", "ask_expert"))
    assert gap == "I have no knowledge that applies to Van Dam Logistics (BE). Ellen Maes can confirm."
    restricted = {"topic": None, "restricted": {"message": "Salaries are private.", "contact": None}}
    assert speech_for(restricted) == "That's not something I can share."
    suggestions = {"topic": None, "suggestions": [{"label": "A"}, {"label": "B"}, {"label": "C"}]}
    assert speech_for(suggestions) == "I couldn't match that to a topic I know. Try asking about A, B or C."
