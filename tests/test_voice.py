from conftest import login

from trustlabel.ai import ExtractedClaim

CUTOFF = "payroll.variables_cutoff"
TRANSCRIPT = "Yes, Van Dam Logistics really has the 25th as cut-off, valid until 31 March 2027."


class StubTranscriber:
    def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        return TRANSCRIPT


class StubExtractor:
    def __init__(self, quote: str) -> None:
        self.quote = quote

    def extract(self, text, topics, today):
        return [
            ExtractedClaim(
                topic_id=CUTOFF, value="25", quote=self.quote, client_specific=True, valid_until="2027-03-31"
            )
        ]


def open_van_dam_request(client):
    lotte = login(client, "lotte")
    response = lotte.post(
        "/api/verifications", json={"topic_id": CUTOFF, "client_id": "vandam", "question": "Cut-off?"}
    )
    assert response.status_code == 201
    return lotte, response.json()["id"]


def upload(client, vid, audio=b"voice-bytes"):
    return client.post(
        f"/api/verifications/{vid}/voice", files={"audio": ("answer.webm", audio, "audio/webm")}
    )


def test_voice_answer_prefills_and_becomes_evidence_after_expert_confirms(make_client):
    client = make_client(StubExtractor("the 25th as cut-off"), StubTranscriber())
    lotte, vid = open_van_dam_request(client)
    jonas, ellen = login(client, "jonas"), login(client, "ellen")

    assert upload(jonas, vid).status_code == 404
    assert upload(ellen, vid, b"x" * 2_000_001).status_code == 413

    voice = upload(ellen, vid)
    assert voice.status_code == 200
    suggestion = voice.json()["suggestion"]
    assert (suggestion["value"], suggestion["valid_until"]) == ("25", "2027-03-31")
    assert lotte.post("/api/ask", json={"topic_id": CUTOFF, "client_id": "vandam"}).json()["answer"][
        "status"
    ] == "conflict", "a voice note alone must not resolve anything"

    resolved = ellen.post(
        f"/api/verifications/{vid}/resolve",
        json={"value": "25", "valid_until": suggestion["valid_until"]},
    )
    assert resolved.status_code == 200
    result = lotte.post("/api/ask", json={"topic_id": CUTOFF, "client_id": "vandam"}).json()
    verified = result["sources"][0]
    assert verified["kind"] == "verified_answer"
    assert "Voice statement by Ellen Maes" in verified["body"]


def test_extracted_quote_not_in_transcript_gives_no_suggestion(make_client):
    client = make_client(StubExtractor("the 25th of every month"), StubTranscriber())
    _, vid = open_van_dam_request(client)
    voice = upload(login(client, "ellen"), vid)
    assert voice.status_code == 200
    assert voice.json()["suggestion"] is None
    assert voice.json()["transcript"] == TRANSCRIPT
