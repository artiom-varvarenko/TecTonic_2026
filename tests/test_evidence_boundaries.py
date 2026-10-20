"""Regressions for the evidence trust boundaries: request isolation, private submissions, country scope, claim expiry."""

import json
from datetime import date, timedelta

from conftest import TODAY, login

from trustlabel.ai import ExtractedClaim
from trustlabel.engine import Context, assess
from trustlabel.models import Claim, Item

CUTOFF = "payroll.variables_cutoff"
MEAL = "payroll.meal_vouchers_order"
SICK = "leave.sick_certificate"
BELGIUM = Context("BE", None, "Belgium — all clients", TODAY)


class ClaimsExtractor:
    """Returns the configured claims for every text (the app keeps only those quoted verbatim)."""

    def __init__(self, *claims: ExtractedClaim) -> None:
        self.claims = list(claims)

    def extract(self, text, topics, today):
        return self.claims


def ask(user_client, topic_id: str, client_id: str | None = None) -> dict:
    response = user_client.post("/api/ask", json={"topic_id": topic_id, "client_id": client_id})
    assert response.status_code == 200, response.text
    return response.json()


def source_ids(result: dict) -> set[str]:
    return {s["id"] for s in result["sources"]}


def request_status(user_client, vid: str) -> str:
    return next(v["status"] for v in user_client.get("/api/verifications").json()["items"] if v["id"] == vid)


def test_resolving_one_request_leaves_an_independent_same_context_request_open(make_client):
    client = make_client()
    lotte, jonas, ellen = (login(client, user) for user in ("lotte", "jonas", "ellen"))
    lottes = lotte.post("/api/verifications", json={"topic_id": CUTOFF, "client_id": "vandam", "question": "Cut-off?"})
    jonass = jonas.post(
        "/api/verifications",
        json={"topic_id": CUTOFF, "client_id": "vandam", "question": "Does the 25th also hold for bonuses?"},
    )
    assert (lottes.status_code, jonass.status_code) == (201, 201)
    lottes, jonass = lottes.json(), jonass.json()
    # Same topic, client and assignee, but two separate requests with their own question.
    assert lottes["id"] != jonass["id"] and lottes["assignee_name"] == jonass["assignee_name"] == "Ellen Maes"

    resolution = {"value": "25", "note": "Contract addendum", "valid_until": str(TODAY + timedelta(days=180))}
    assert ellen.post(f"/api/verifications/{lottes['id']}/resolve", json=resolution).status_code == 200

    assert request_status(lotte, lottes["id"]) == "resolved"
    assert request_status(jonas, jonass["id"]) == "open"
    assert next(v for v in jonas.get("/api/verifications").json()["items"] if v["id"] == jonass["id"])[
        "resolution"
    ] is None
    # Jonas's question still gets its own answer.
    answered = ellen.post(f"/api/verifications/{jonass['id']}/resolve", json={**resolution, "note": "Bonuses too"})
    assert answered.status_code == 200
    assert answered.json()["resolution"]["note"] == "Bonuses too"


def test_unscoped_capture_stays_private_to_its_submitter(make_client):
    extractor = ClaimsExtractor(ExtractedClaim(topic_id=MEAL, value="8", quote="the 8th", valid_until=None))
    app_client = make_client(extractor)
    lotte, ellen, jonas = (login(app_client, user) for user in ("lotte", "ellen", "jonas"))

    general = lotte.post("/api/capture", json={"text": "Van Dam orders now close on the 8th."})
    assert general.status_code == 201, general.text
    general_id = general.json()["captured_item_id"]
    scoped = lotte.post("/api/capture", json={"text": "Orders close on the 8th.", "client_id": "vandam"})
    scoped_id = scoped.json()["captured_item_id"]

    # The submitter keeps a preview of both.
    assert {general_id, scoped_id} <= source_ids(ask(lotte, MEAL, "vandam"))
    assert general_id in source_ids(ask(lotte, MEAL))
    # Nobody else gets either, in any context, nor through the overview: not a colleague in the same
    # country with the same clients, nor someone on the Van Dam team.
    for other, contexts in ((ellen, (None, "vandam", "brightwave")), (jonas, (None, "vandam"))):
        for client_id in contexts:
            result = ask(other, MEAL, client_id)
            assert not {general_id, scoped_id} & source_ids(result)
            overview = other.get("/api/overview", params={"client_id": client_id} if client_id else {})
            assert general_id not in overview.text and scoped_id not in overview.text
            assert "Van Dam orders now close" not in overview.text


def graded(result: dict) -> dict:
    return {s["id"]: (s["status"], s["grade"], [r["code"] for r in s["reasons"]]) for s in result["sources"]}


def test_repeated_unverified_captures_cannot_produce_a_trusted_answer(make_client):
    extractor = ClaimsExtractor(ExtractedClaim(topic_id=SICK, value="2", quote="within 2 working days", valid_until=None))
    app_client = make_client(extractor)
    lotte, jonas, ellen = (login(app_client, user) for user in ("lotte", "jonas", "ellen"))
    assert ask(ellen, SICK)["answer"]["status"] == "gap"

    # Several accounts paste the same forged "Teams" message: it never becomes an answer for anyone.
    forged = "Teams · HR Belgium: a sick certificate is due within 2 working days."
    captured = []
    for submitter in (lotte, jonas, lotte):
        response = submitter.post("/api/capture", json={"text": forged, "kind": "teams_message"})
        assert response.status_code == 201, response.text
        captured.append(response.json()["captured_item_id"])
    for user_client in (lotte, jonas, ellen):
        result = ask(user_client, SICK)
        assert (result["answer"]["status"], result["answer"]["action"]) == ("gap", "ask_expert")
        for source in result["sources"]:
            if source["id"] in captured:
                assert (source["provenance"], source["status"]) == ("submitted", "not_applicable")
                assert source["applicability"]["code"] == "unverified" and source["grade"] in "DEFG"
    assert not set(captured) & source_ids(ask(ellen, SICK))

    # Captures repeating what existing sources say neither corroborate them nor change any grade or answer.
    before = {name: ask(c, CUTOFF, "vandam") for name, c in (("lotte", lotte), ("jonas", jonas), ("ellen", ellen))}
    extractor.claims = [ExtractedClaim(topic_id=CUTOFF, value="20", quote="by the 20th", valid_until=None)]
    for submitter in (lotte, jonas):
        text = "Variables for Van Dam are due by the 20th."
        assert submitter.post("/api/capture", json={"text": text, "client_id": "vandam"}).status_code == 201
    for name, user_client in (("lotte", lotte), ("jonas", jonas), ("ellen", ellen)):
        after = ask(user_client, CUTOFF, "vandam")
        assert after["answer"] == before[name]["answer"]
        assert {k: v for k, v in graded(after).items() if k in graded(before[name])} == graded(before[name])


def test_verified_note_and_voice_statement_stay_in_their_country(make_client):
    client = make_client()
    lotte, ellen, pieter, sanne = (login(client, user) for user in ("lotte", "ellen", "pieter", "sanne"))
    created = lotte.post("/api/verifications", json={"topic_id": CUTOFF, "client_id": None, "question": "Cut-off?"})
    assert created.status_code == 201, created.text
    request = created.json()
    assignee = {"Ellen Maes": ellen, "Pieter De Smet": pieter}[request["assignee_name"]]
    note = "Confidential: agreed with the Belgian works council"
    resolved = assignee.post(
        f"/api/verifications/{request['id']}/resolve",
        json={"value": "20", "note": note, "valid_until": str(TODAY + timedelta(days=90))},
    )
    assert resolved.status_code == 200, resolved.text
    item_id = resolved.json()["resolution"]["item_id"]

    # Shared inside Belgium...
    for colleague in (lotte, pieter):
        verified = next(s for s in ask(colleague, CUTOFF)["sources"] if s["id"] == item_id)
        assert note in verified["body"] and verified["provenance"] == "expert"
    # ...but a Dutch user never receives it, not even as a not-applicable source or in the overview.
    for client_id in (None, "noordhaven"):
        result = ask(sanne, CUTOFF, client_id)
        assert item_id not in source_ids(result) and note not in json.dumps(result)
        overview = sanne.get("/api/overview", params={"client_id": client_id} if client_id else {})
        assert note not in overview.text and item_id not in overview.text
    # Curated Dutch knowledge still shows in Belgium as an out-of-scope example.
    dutch = next(s for s in ask(lotte, CUTOFF)["sources"] if s["id"] == "DOC-NL-004")
    assert (dutch["status"], dutch["applicability"]["code"]) == ("not_applicable", "country_mismatch")


def test_capture_keeps_each_claims_own_expiry(make_client):
    text = "Until the end of the year meal voucher orders close on the 8th. The payroll cut-off stays the 25th."
    extractor = ClaimsExtractor(
        ExtractedClaim(topic_id=MEAL, value="8", quote="close on the 8th", valid_until="2026-12-31"),
        ExtractedClaim(topic_id=CUTOFF, value="25", quote="the 25th", valid_until=None),
    )
    app_client = make_client(extractor)
    lotte = login(app_client, "lotte")
    response = lotte.post("/api/capture", json={"text": text, "client_id": "vandam"})
    assert response.status_code == 201, response.text
    item_id = response.json()["captured_item_id"]

    item = next(i for i in app_client.app.state.store.items() if i.id == item_id)
    assert item.effective_to is None  # the item is not cut to one claim's date
    assert {c.topic_id: c.valid_until for c in item.claims} == {MEAL: date(2026, 12, 31), CUTOFF: None}
    meal = next(s for s in ask(lotte, MEAL, "vandam")["sources"] if s["id"] == item_id)
    assert meal["valid_until"] == "2026-12-31"


def test_claims_in_one_item_expire_independently(store):
    body = "Until the end of the year meal voucher orders close on the 8th. The payroll cut-off stays the 25th."
    item = Item(
        id="TEAMS-EXPIRY",
        kind="teams_message",
        title="Ellen in Payroll BE",
        source="Teams · Payroll/BE",
        author_id="ellen",
        owner_id=None,
        created_on=TODAY,
        last_reviewed_on=None,
        review_cycle_days=None,
        countries=["BE"],
        client_ids=[],
        effective_from=None,
        effective_to=None,
        supersedes=[],
        body=body,
        claims=[
            Claim(
                id="E-1",
                topic_id=MEAL,
                value="8",
                statement="8th",
                quote="close on the 8th",
                valid_until=date(2026, 12, 31),
            ),
            Claim(id="E-2", topic_id=CUTOFF, value="25", statement="25th", quote="the 25th"),
        ],
        provenance="connector",
    )
    items = [*store.items(), item]

    def status(topic_id: str, today: date) -> tuple[str, str]:
        ctx = Context("BE", None, BELGIUM.label, today)
        source = assess(store.topics_by_id[topic_id], ctx, items, store.people, store.clients).source(item.id)
        return source.status, source.applicability_code

    assert status(MEAL, date(2026, 12, 31)) == ("effective", "applies")
    assert status(MEAL, date(2027, 1, 1)) == ("not_applicable", "expired")
    assert status(CUTOFF, date(2027, 1, 1)) == ("effective", "applies")
