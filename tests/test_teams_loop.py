import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import timedelta

from conftest import TODAY, login
from test_teams_alerts import ELLEN_TEAMS, REQUEST, StubTeams, settle

from trustlabel.app import WEBHOOK_CALLS_PER_MINUTE
from trustlabel.engine import validate_value
from trustlabel.store import Store
from trustlabel.teams_alerts import message_text, parse_reply, request_code, split_answer

LOTTE_TEAMS = "lotte.janssens@sdworx.example"
ELLEN_AAD = "0e11e000-0000-4000-8000-00000000e11e"
LOTTE_AAD = "1077e000-0000-4000-8000-00000000107e"
SECRET = base64.b64encode(secrets.token_bytes(32)).decode()
OUTGOING = "/api/teams/outgoing"
PUBLIC = "https://trustlabel.example.com"


def teams_client(make_client, teams=None, **overrides):
    settings = {
        "teams_users": {"ellen": ELLEN_TEAMS, "lotte": LOTTE_TEAMS},
        "teams_outgoing_secret": SECRET,
        "teams_ids": {"ellen": ELLEN_AAD},
        "public_url": PUBLIC,
    }
    settings.update(overrides)
    return make_client(teams_alerts=teams, **settings)


def open_request(app_client) -> dict:
    created = login(app_client, "lotte").post("/api/verifications", json=REQUEST)
    assert created.status_code == 201, created.text
    return created.json()


def activity(text: str, aad: str | None = ELLEN_AAD) -> bytes:
    sender = {"id": "29:1abc", "name": "Ellen Maes"}
    if aad is not None:
        sender["aadObjectId"] = aad
    return json.dumps({"type": "message", "text": text, "from": sender}).encode()


def signed(body: bytes, secret: str = SECRET) -> dict:
    mac = hmac.new(base64.b64decode(secret), body, hashlib.sha256).digest()
    return {"Authorization": "HMAC " + base64.b64encode(mac).decode(), "Content-Type": "application/json"}


def post_teams(app_client, text: str, aad: str | None = ELLEN_AAD) -> dict:
    body = activity(text, aad)
    response = app_client.post(OUTGOING, content=body, headers=signed(body))
    assert response.status_code == 200, response.text
    reply = response.json()
    assert reply["type"] == "message"
    return reply


def test_resolving_notifies_the_asker_and_followers_in_one_card(make_client):
    teams = StubTeams()
    app_client = teams_client(make_client, teams)
    request = open_request(app_client)
    # Jonas asks the same question for the same client and follows Lotte's open request.
    jonas = login(app_client, "jonas")
    ask = {"question": REQUEST["question"], "client_id": "vandam", "topic_id": REQUEST["topic_id"], "auto_ask": True}
    asked = jonas.post("/api/ask", json=ask)
    assert asked.status_code == 200 and asked.json()["auto_request"]["id"] == request["id"]
    resolution = {"value": "25", "note": "Contract addendum 2026", "valid_until": str(TODAY + timedelta(days=180))}
    resolved = login(app_client, "ellen").post(f"/api/verifications/{request['id']}/resolve", json=resolution)
    assert resolved.status_code == 200
    settle(app_client)

    alert, done = teams.payloads  # the request alert to Ellen, then exactly one resolve card
    assert alert["recipient"] == ELLEN_TEAMS
    assert done["recipient"] == LOTTE_TEAMS
    card = done["attachments"][0]["content"]
    assert card["body"][1]["text"] == (
        "<at>Lotte Janssens</at>, Jonas Wouters, Ellen Maes verified the payroll variables cut-off for "
        "Van Dam Logistics NV (BE): 25th of the month (grade A)"
    )
    assert card["body"][2]["facts"] == [{"title": "Note", "value": "Contract addendum 2026"}]
    lotte = {"id": LOTTE_TEAMS, "name": "Lotte Janssens"}
    assert card["msteams"]["entities"] == [{"type": "mention", "text": "<at>Lotte Janssens</at>", "mentioned": lotte}]
    assert card["actions"] == [{"type": "Action.OpenUrl", "title": "Open in TrustLabel", "url": f"{PUBLIC}/?view=ask"}]


def test_the_request_card_shows_the_teams_reply_code_only_when_the_webhook_is_set(make_client):
    for secret, expected in ((SECRET, True), (None, False)):
        teams = StubTeams()
        app_client = teams_client(make_client, teams, teams_outgoing_secret=secret)
        request = open_request(app_client)
        settle(app_client)
        texts = [block.get("text", "") for block in teams.payloads[0]["attachments"][0]["content"]["body"]]
        line = f"Or reply in Teams: @TrustLabel {request_code(request['id'])} <your answer>"
        assert (line in texts) is expected


def test_without_a_workflow_nothing_is_sent_and_resolving_still_works(make_client):
    app_client = teams_client(make_client, teams=None)
    assert app_client.app.state.alert_pool is None
    request = open_request(app_client)
    resolution = {"value": "25", "valid_until": str(TODAY + timedelta(days=180))}
    path = f"/api/verifications/{request['id']}/resolve"
    assert login(app_client, "ellen").post(path, json=resolution).status_code == 200


def test_outgoing_webhook_needs_a_valid_hmac_over_the_raw_body(make_client):
    app_client = teams_client(make_client)
    body = activity("<at>TrustLabel</at> hello")
    assert app_client.post(OUTGOING, content=body).status_code == 401  # missing
    other = base64.b64encode(secrets.token_bytes(32)).decode()
    assert app_client.post(OUTGOING, content=body, headers=signed(body, other)).status_code == 401  # wrong key
    tampered = body.replace(b"hello", b"hellO")
    assert app_client.post(OUTGOING, content=tampered, headers=signed(body)).status_code == 401  # body changed
    good = app_client.post(OUTGOING, content=body, headers=signed(body))
    assert good.status_code == 200 and "@TrustLabel TL-XXXX" in good.json()["text"]
    huge = activity("x" * 70_000)
    assert app_client.post(OUTGOING, content=huge, headers=signed(huge)).status_code == 413
    # Not configured: the endpoint does not exist.
    assert teams_client(make_client, teams_outgoing_secret=None).post(OUTGOING, content=body).status_code == 404


def test_outgoing_webhook_calls_are_limited_per_ip(make_client):
    app_client = teams_client(make_client)
    body = activity("<at>TrustLabel</at> hello")
    for _ in range(WEBHOOK_CALLS_PER_MINUTE):
        assert app_client.post(OUTGOING, content=body).status_code == 401
    assert app_client.post(OUTGOING, content=body, headers=signed(body)).status_code == 429


def test_an_unknown_sender_gets_their_aad_object_id_and_how_to_map_it(make_client):
    app_client = teams_client(make_client)
    reply = post_teams(app_client, "<at>TrustLabel</at> TL-AAAA 25", aad=LOTTE_AAD)
    assert LOTTE_AAD in reply["text"] and "TRUSTLABEL_TEAMS_IDS" in reply["text"]


def test_only_the_assigned_expert_can_answer_from_teams(make_client):
    teams = StubTeams()
    app_client = teams_client(make_client, teams, teams_ids={"ellen": ELLEN_AAD, "lotte": LOTTE_AAD})
    request = open_request(app_client)
    code = request_code(request["id"])
    reply = post_teams(app_client, f"<at>TrustLabel</at> {code} 25", aad=LOTTE_AAD)
    assert reply["text"] == f"{code} is not a verification request assigned to you."
    assert login(app_client, "lotte").get("/api/verifications").json()["items"][0]["status"] == "open"


def test_an_answer_from_teams_resolves_like_the_inbox_and_tells_the_asker(make_client):
    teams = StubTeams()
    app_client = teams_client(make_client, teams)
    request = open_request(app_client)
    code = request_code(request["id"])
    bad = post_teams(app_client, f"<at>TrustLabel</at>&nbsp;{code.lower()} soon")
    assert bad["text"].startswith(f"{code}: Value must be a day of the month (1–31)")

    reply = post_teams(app_client, f"<p><at>TrustLabel</at>&nbsp;{code} 25th - per contract addendum</p>")
    valid_until = (TODAY + timedelta(days=180)).isoformat()
    assert reply["text"] == (
        "Verified: Payroll variables cut-off for Van Dam Logistics NV (BE) is 25th of the month (grade A), "
        f"valid until {valid_until}. Everyone who asked sees it in TrustLabel now."
    )
    assert post_teams(app_client, f"<at>TrustLabel</at> {code} 25")["text"] == f"{code} was already answered."
    settle(app_client)

    # Same resolution as the inbox would store.
    [mine] = login(app_client, "lotte").get("/api/verifications").json()["items"]
    resolution = mine["resolution"]
    assert mine["status"] == "resolved"
    assert (resolution["value"], resolution["note"], resolution["valid_until"]) == (
        "25",
        "per contract addendum",
        valid_until,
    )
    done = teams.payloads[-1]
    assert done["recipient"] == LOTTE_TEAMS
    assert done["attachments"][0]["content"]["body"][1]["text"].startswith(
        "<at>Lotte Janssens</at>, Ellen Maes verified the payroll variables cut-off"
    )


def test_reply_codes_and_answers_parse_like_a_person_types_them(store: Store):
    assert message_text("<p><at>TrustLabel</at>&nbsp;TL-7F2K  25&amp;more</p>\n") == "TL-7F2K 25&more"
    assert parse_reply("tl-7f2k 25th per addendum") == ("TL-7F2K", "25th per addendum")
    assert parse_reply("TL-7F2K") == ("TL-7F2K", "")
    assert parse_reply("hello TL-7F2K 25") is None
    code = request_code("vr_example")
    assert code.startswith("TL-") and len(code) == 7 and not set(code[3:]) & set("01IO")
    cutoff = store.topics_by_id["payroll.variables_cutoff"]
    assert split_answer(cutoff, "25th: per addendum") == ("25", "per addendum")
    assert split_answer(cutoff, "25") == ("25", "")
    amount = next(t for t in store.topics if t.value_type == "amount_eur")
    value, note = split_answer(amount, "750 EUR per month")
    assert validate_value(amount, value) == "750" and note == "per month"


def test_message_text_is_linear_on_unclosed_mentions_and_tags():
    for raw, expected in [
        ("<at>" * 16_000, ""),
        ("<" * 64_000, "<" * 64_000),
        ("<at>x" * 12_800, "x " * 12_799 + "x"),
        ("<at>" * 8_000 + "</at> TL-7F2K", "TL-7F2K"),
    ]:
        started = time.perf_counter()
        assert message_text(raw) == expected
        assert time.perf_counter() - started < 1
