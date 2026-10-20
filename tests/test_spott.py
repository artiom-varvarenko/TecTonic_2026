import base64
import hashlib
import hmac
import json
import time
from datetime import date, timedelta

import httpx
import pytest
from conftest import TODAY, login

from trustlabel.ai import ExtractedClaim
from trustlabel.spott import (
    NOTE_TITLE_MARKER,
    WEBHOOK_PATH,
    SpottNote,
    WebhookError,
    html_to_text,
    note_from_api,
    verify_signature,
    webhook_key,
)

SECRET = "whsec_" + base64.b64encode(b"0123456789abcdef0123456789abcdef").decode()
KEY = webhook_key(SECRET)
NOTE_HTML = (
    "<p>Call with Brightwave HR.</p>"
    "<p>From now on meal voucher orders must be in by the 5th of the month.</p>"
    "<p>Candidate Jan Peeters prefers morning shifts.</p>"
)
MEAL_VOUCHERS = "payroll.meal_vouchers_order"


def signed(payload: dict, msg_id: str = "msg_1", at: float | None = None) -> tuple[bytes, dict]:
    body = json.dumps(payload).encode()
    timestamp = str(int(time.time() if at is None else at))
    digest = hmac.new(KEY, f"{msg_id}.{timestamp}.".encode() + body, hashlib.sha256).digest()
    headers = {
        "svix-id": msg_id,
        "svix-timestamp": timestamp,
        "svix-signature": "v1," + base64.b64encode(digest).decode(),
        "content-type": "application/json",
    }
    return body, headers


def note_event(note_id: str = "note_1") -> dict:
    return {"event": {"name": "note.created"}, "id": note_id, "links": {"clients": [{"id": "sp_bright"}]}}


def spott_note(note_id="note_1", title="Brightwave call", clients=(("sp_bright", "Brightwave Retail BV"),)):
    return SpottNote(
        id=note_id,
        title=title,
        text=html_to_text(NOTE_HTML),
        created_on=TODAY,
        author_name="Artiom Varvarenko",
        clients=clients,
    )


class StubSpott:
    def __init__(self, notes=(), clients=None, down=False):
        self.notes = {n.id: n for n in notes}
        self.clients = clients or {}
        self.down = down
        self.written: list[tuple[str, str, str]] = []

    def get_note(self, note_id):
        return self.notes[note_id]

    def find_client_id(self, name):
        if self.down:
            raise httpx.ConnectError("Spott unreachable")
        return self.clients.get(name)

    def add_client_note(self, client_id, title, html):
        self.written.append((client_id, title, html))
        return f"written_{len(self.written)}"


class StubExtractor:
    def extract(self, text, topics, today):
        return [ExtractedClaim(topic_id=MEAL_VOUCHERS, value="5", quote="by the 5th of the month", valid_until=None)]


def ask(user_client, client_id: str) -> dict:
    return user_client.post("/api/ask", json={"topic_id": MEAL_VOUCHERS, "client_id": client_id}).json()


def spott_sources(result: dict) -> list[dict]:
    return [s for s in result["sources"] if s["kind"] == "spott_note"]


def test_signature_accepts_only_fresh_untampered_deliveries():
    body, headers = signed(note_event())
    assert verify_signature(KEY, headers, body) == "msg_1"
    standard = {name.replace("svix-", "webhook-"): value for name, value in headers.items()}
    assert verify_signature(KEY, standard, body) == "msg_1"
    other_key = webhook_key("whsec_" + base64.b64encode(b"x" * 32).decode())
    stale_body, stale_headers = signed(note_event(), at=time.time() - 600)
    for key, sent_headers, sent_body in (
        (KEY, headers, body + b" "),
        (other_key, headers, body),
        (KEY, stale_headers, stale_body),
    ):
        with pytest.raises(WebhookError):
            verify_signature(key, sent_headers, sent_body)


def test_note_from_api_reads_client_links_and_plain_text():
    note = note_from_api(
        {
            "id": "n1",
            "title": None,
            "content": "<p>Line one.</p><p>Line&nbsp;two</p>",
            "createdAt": "2026-10-20T09:15:00.000Z",
            "createdBy": {"id": "u1", "name": "Artiom Varvarenko", "avatarUrl": None, "deactivatedAt": None},
            "links": [
                {"id": "l1", "entityType": "client", "client": {"id": "c1", "name": "Brightwave Retail BV"}},
                {"id": "l2", "entityType": "candidate", "candidate": {"id": "x1"}},
            ],
        }
    )
    assert (note.title, note.text, note.created_on, note.author_name, note.clients) == (
        "",
        "Line one.\nLine two",
        date(2026, 10, 20),
        "Artiom Varvarenko",
        (("c1", "Brightwave Retail BV"),),
    )


def test_signed_note_on_a_client_becomes_a_scoped_graded_source(make_client):
    client = make_client(StubExtractor(), spott=StubSpott([spott_note()]), spott_webhook_secret=SECRET)
    body, headers = signed(note_event())
    assert client.post(WEBHOOK_PATH, content=body, headers=headers).status_code == 202
    assert client.post(WEBHOOK_PATH, content=body, headers=headers).json() == {"status": "duplicate"}

    lotte = login(client, "lotte")
    result = ask(lotte, "brightwave")
    [captured] = spott_sources(result)
    # Only the sentence stating the claim is kept; the candidate remark in the same note is not stored.
    assert captured["value"] == "5"
    assert captured["body"] == "From now on meal voucher orders must be in by the 5th of the month."
    assert result["answer"]["status"] == "conflict"
    assert [s["status"] for s in spott_sources(ask(lotte, "vandam"))] == ["not_applicable"]
    # Client knowledge stays with the client's team: Jonas only works for Van Dam.
    assert spott_sources(ask(login(client, "jonas"), "vandam")) == []


def test_webhook_rejects_forged_ambiguous_unknown_and_own_notes(make_client):
    notes = [
        spott_note("note_two", clients=(("sp_bright", "Brightwave Retail BV"), ("sp_vandam", "Van Dam Logistics NV"))),
        spott_note("note_unknown", clients=(("sp_other", "Unknown Client BV"),)),
        spott_note("note_own", title=f"{NOTE_TITLE_MARKER} Verified: Meal voucher order deadline"),
    ]
    client = make_client(StubExtractor(), spott=StubSpott(notes), spott_webhook_secret=SECRET)
    body, headers = signed(note_event())
    assert client.post(WEBHOOK_PATH, content=body, headers={**headers, "svix-signature": "v1,AAAA"}).status_code == 401
    for n, note in enumerate(notes):
        body, headers = signed(note_event(note.id), msg_id=f"msg_{n}")
        assert client.post(WEBHOOK_PATH, content=body, headers=headers).status_code == 202
    assert spott_sources(ask(login(client, "lotte"), "brightwave")) == []


def test_webhook_is_off_without_a_signing_secret(make_client):
    client = make_client(StubExtractor(), spott=StubSpott([spott_note()]))
    body, headers = signed(note_event())
    assert client.post(WEBHOOK_PATH, content=body, headers=headers).status_code == 404


def resolve_vandam_cutoff(client) -> int:
    created = login(client, "lotte").post(
        "/api/verifications",
        json={"topic_id": "payroll.variables_cutoff", "client_id": "vandam", "question": "Cut-off?"},
    )
    resolution = {"value": "25", "note": "Contract addendum", "valid_until": str(TODAY + timedelta(days=180))}
    resolved = login(client, "ellen").post(f"/api/verifications/{created.json()['id']}/resolve", json=resolution)
    return resolved.status_code


def test_verified_answer_is_written_to_the_clients_spott_record(make_client):
    spott = StubSpott(clients={"Van Dam Logistics NV": "sp_vandam"})
    assert resolve_vandam_cutoff(make_client(spott=spott)) == 200
    [(spott_client, title, html)] = spott.written
    assert spott_client == "sp_vandam" and title.startswith(NOTE_TITLE_MARKER)
    assert "25th" in html and "Ellen Maes" in html and "Contract addendum" in html


def test_verification_still_resolves_when_spott_is_down(make_client):
    spott = StubSpott(down=True)
    assert resolve_vandam_cutoff(make_client(spott=spott)) == 200
    assert spott.written == []
