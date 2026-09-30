from datetime import timedelta

from conftest import TODAY, login, password_for
from fastapi.testclient import TestClient

CUTOFF_QUESTION = {"question": "What's the cut-off for submitting overtime this month?", "client_id": "vandam"}


def test_request_guards_reject_anonymous_cross_origin_and_oversized_requests(make_client):
    client = make_client()
    assert client.post("/api/ask", json=CUTOFF_QUESTION).status_code == 401

    lotte = login(client, "lotte")
    cross_origin = lotte.post("/api/ask", json=CUTOFF_QUESTION, headers={"Origin": "https://evil.example"})
    assert cross_origin.status_code == 403

    oversized = lotte.post(
        "/api/ask", content=b"x" * 3_000_001, headers={"Content-Type": "application/json"}
    )
    assert oversized.status_code == 413


def test_asking_for_a_client_outside_the_portfolio_is_forbidden(make_client):
    lotte = login(make_client(), "lotte")
    response = lotte.post("/api/ask", json={**CUTOFF_QUESTION, "client_id": "noordhaven"})
    assert response.status_code == 403


def test_verification_flow_only_assignee_resolves_once_and_everyone_sees_it(make_client):
    client = make_client()
    lotte, jonas, ellen = (login(client, user) for user in ("lotte", "jonas", "ellen"))
    created = lotte.post(
        "/api/verifications",
        json={"topic_id": "payroll.variables_cutoff", "client_id": "vandam", "question": "Cut-off?"},
    )
    assert created.status_code == 201
    request = created.json()
    assert request["assignee_name"] == "Ellen Maes"

    resolution = {"value": "25", "note": "Contract addendum", "valid_until": str(TODAY + timedelta(days=180))}
    path = f"/api/verifications/{request['id']}/resolve"
    assert jonas.post(path, json=resolution).status_code == 404
    assert ellen.post(path, json=resolution).status_code == 200
    assert ellen.post(path, json=resolution).status_code == 409

    answer = lotte.post("/api/ask", json=CUTOFF_QUESTION).json()["answer"]
    assert (answer["status"], answer["value"]) == ("verified", "25")


def test_login_is_rate_limited_after_five_failures(make_client):
    client = make_client()
    for _ in range(5):
        response = client.post("/api/login", json={"username": "ellen", "password": "wrong-password"})
        assert response.status_code == 401
    blocked = client.post("/api/login", json={"username": "ellen", "password": password_for("ellen")})
    assert blocked.status_code == 429


def test_client_specific_chat_is_invisible_outside_the_client_team(make_client):
    pieter = login(make_client(), "pieter")
    result = pieter.post("/api/ask", json={**CUTOFF_QUESTION, "client_id": None}).json()
    assert result["topic"]["id"] == "payroll.variables_cutoff"
    assert "TEAMS-4411" not in {source["id"] for source in result["sources"]}


def test_logout_revokes_the_session_server_side(make_client):
    lotte = login(make_client(), "lotte")
    stolen_cookie = lotte.cookies.get("trustlabel_session")
    assert lotte.post("/api/logout").status_code == 204

    replay = TestClient(lotte.app, cookies={"trustlabel_session": stolen_cookie})
    assert replay.get("/api/me").status_code == 401


def test_resolve_rejects_validity_beyond_two_years(make_client):
    client = make_client()
    created = login(client, "lotte").post(
        "/api/verifications",
        json={"topic_id": "payroll.variables_cutoff", "client_id": "vandam", "question": "Cut-off?"},
    )
    too_late = {"value": "25", "valid_until": str(TODAY + timedelta(days=731))}
    response = login(client, "ellen").post(f"/api/verifications/{created.json()['id']}/resolve", json=too_late)
    assert response.status_code == 422
