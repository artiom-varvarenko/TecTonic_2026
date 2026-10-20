from conftest import TODAY, login
from test_spott import MEAL_VOUCHERS, SECRET, StubExtractor, StubSpott, note_event, signed, spott_note, spott_sources

from trustlabel.spott import NOTE_TITLE_MARKER, WEBHOOK_PATH, SpottNote, question_text

VANDAM = ("sp_vandam", "Van Dam Logistics NV")


def question_note(note_id: str, text: str, clients=(VANDAM,)) -> SpottNote:
    return SpottNote(
        id=note_id, title="Quick question", text=text, created_on=TODAY, author_name="Artiom", clients=clients
    )


class RecordingSpott(StubSpott):
    """Serves the notes TrustLabel writes back too, so their own webhooks can be delivered."""

    def add_client_note(self, client_id, title, html):
        note_id = super().add_client_note(client_id, title, html)
        self.notes[note_id] = SpottNote(
            id=note_id, title=title, text=html, created_on=TODAY, author_name="TrustLabel", clients=(VANDAM,)
        )
        return note_id


class CountingExtractor(StubExtractor):
    def __init__(self):
        self.calls = 0

    def extract(self, text, topics, today):
        self.calls += 1
        return super().extract(text, topics, today)


def deliver(client, note_id: str, msg_id: str):
    body, headers = signed(note_event(note_id), msg_id=msg_id)
    return client.post(WEBHOOK_PATH, content=body, headers=headers)


def ask(client, client_id: str) -> dict:
    return client.post("/api/ask", json={"topic_id": MEAL_VOUCHERS, "client_id": client_id}).json()


def all_items(client) -> list[str]:
    lotte = login(client, "lotte")
    return [s["id"] for c in ("vandam", "brightwave") for s in ask(lotte, c)["sources"]]


def test_question_prefix_is_case_insensitive_and_only_at_the_start():
    assert question_text("  @trustlabel what is the payroll cut-off?") == "what is the payroll cut-off?"
    assert question_text("TRUSTLABEL: meal voucher deadline\nfor Van Dam") == "meal voucher deadline for Van Dam"
    assert question_text("Call notes. @TrustLabel was mentioned") is None
    assert question_text("TrustLabel is great") is None


def test_question_note_gets_one_labelled_reply_and_is_never_captured(make_client):
    extractor = CountingExtractor()
    spott = RecordingSpott([question_note("q1", "@TrustLabel what is the payroll cut-off for overtime?")])
    client = make_client(extractor, spott=spott, spott_webhook_secret=SECRET)
    before = all_items(client)

    assert deliver(client, "q1", "msg_q1").status_code == 202
    assert deliver(client, "q1", "msg_q1").json() == {"status": "duplicate"}

    [(spott_id, title, html)] = spott.written
    assert spott_id == "sp_vandam"
    assert title.startswith(NOTE_TITLE_MARKER) and "Payroll variables cut-off" in title
    assert "Payroll variables cut-off" in html and "grade" in html and "Who can verify" in html
    assert "Suggested reply" not in html
    assert extractor.calls == 0
    assert all_items(client) == before

    # The reply note's own webhook is ignored: no second reply, no capture.
    assert deliver(client, "written_1", "msg_reply").status_code == 202
    assert len(spott.written) == 1
    assert extractor.calls == 0
    assert all_items(client) == before


def test_unlinked_client_and_unknown_topic_get_a_short_reply(make_client):
    notes = [
        question_note("q_unknown", "TrustLabel: payroll cut-off?", clients=(("sp_x", "Unknown Client BV"),)),
        question_note("q_topic", "@TrustLabel who is the account manager?"),
    ]
    spott = StubSpott(notes)
    client = make_client(CountingExtractor(), spott=spott, spott_webhook_secret=SECRET)
    for note in notes:
        assert deliver(client, note.id, f"msg_{note.id}").status_code == 202
    [(unknown_id, _, unknown_html), (topic_id, _, topic_html)] = spott.written
    assert unknown_id == "sp_x" and "client not linked" in unknown_html
    assert topic_id == "sp_vandam" and "no matching topic" in topic_html


def test_knowledge_note_is_still_captured(make_client):
    spott = StubSpott([spott_note()])
    client = make_client(StubExtractor(), spott=spott, spott_webhook_secret=SECRET)
    assert deliver(client, "note_1", "msg_k").status_code == 202
    sources = spott_sources(ask(login(client, "lotte"), "brightwave"))
    assert [s["value"] for s in sources] == ["5"]
    assert spott.written == []
