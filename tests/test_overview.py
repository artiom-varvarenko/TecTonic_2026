from datetime import timedelta

from conftest import TODAY, login

CUTOFF = "payroll.variables_cutoff"
QUESTION = "What's the cut-off for submitting overtime this month?"


def board(client, client_id=None):
    params = {"client_id": client_id} if client_id else {}
    response = client.get("/api/overview", params=params)
    assert response.status_code == 200, response.text
    data = response.json()
    return data, {t["topic"]["id"]: t for t in data["topics"]}


def test_overview_scopes_board_and_debt_to_context(make_client):
    lotte = login(make_client(), "lotte")
    data, topics = board(lotte, "vandam")
    assert topics[CUTOFF]["answer"]["status"] == "conflict"
    assert topics["leave.sick_certificate"]["answer"]["status"] == "gap"
    debt = {a["id"]: a for a in data["attention"]}
    assert "DOC-BE-009" in debt and debt["DOC-BE-009"]["owner_name"] is None
    assert "DOC-NL-004" not in debt  # other country: out of scope, not this context's debt
    # Superseded DOC-BE-009 is in scope but not current; the Dutch sources are out of scope.
    assert (data["health"]["in_scope"], data["health"]["current"]) == (6, 5)
    assert lotte.get("/api/overview", params={"client_id": "noordhaven"}).status_code == 403

    # Pieter is not on the Van Dam team: the client-specific Teams claim must not reach his board.
    _, pieter_topics = board(login(make_client(), "pieter"))
    assert pieter_topics[CUTOFF]["answer"]["status"] == "consistent"
    assert pieter_topics[CUTOFF]["answer"]["value"] == "20"


def test_overview_activity_shares_verified_answers_only_with_the_client_team(make_client):
    app_client = make_client()
    lotte = login(app_client, "lotte")
    created = lotte.post("/api/verifications", json={"topic_id": CUTOFF, "client_id": "vandam", "question": QUESTION})
    assert created.status_code == 201
    ellen = login(app_client, "ellen")
    resolved = ellen.post(
        f"/api/verifications/{created.json()['id']}/resolve",
        json={"value": "25", "note": "", "valid_until": (TODAY + timedelta(days=180)).isoformat()},
    )
    assert resolved.status_code == 200

    data, topics = board(lotte, "vandam")
    assert topics[CUTOFF]["answer"]["status"] == "verified"
    assert data["health"]["verified"] == 1
    assert data["requests"] == {"awaiting_you": 0, "sent_open": 0, "resolved": 1}
    assert any(e["kind"] == "verified" and "25th of the month" in e["text"] for e in data["activity"])

    jonas_data, _ = board(login(app_client, "jonas"), "vandam")  # same client team, not involved
    assert any(e["kind"] == "verified" for e in jonas_data["activity"])
    pieter_data, _ = board(login(app_client, "pieter"))  # no Van Dam access
    assert not any("Van Dam" in e["text"] for e in pieter_data["activity"])
