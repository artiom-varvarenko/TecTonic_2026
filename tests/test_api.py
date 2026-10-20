from datetime import timedelta

from conftest import TODAY, login, password_for
from fastapi.testclient import TestClient

from trustlabel.app import LOGIN_MAX_FAILURES_PER_IP, SESSION_MAX_AGE_SECONDS

CUTOFF_QUESTION = {"question": "What's the cut-off for submitting overtime this month?", "client_id": "vandam"}


def test_request_guards_reject_anonymous_cross_origin_and_oversized_requests(make_client):
    client = make_client()
    assert client.post("/api/ask", json=CUTOFF_QUESTION).status_code == 401

    lotte = login(client, "lotte")
    cross_origin = lotte.post("/api/ask", json=CUTOFF_QUESTION, headers={"Origin": "https://evil.example"})
    assert cross_origin.status_code == 403
    # Browsers that omit Origin still announce where the request came from.
    assert lotte.post("/api/ask", json=CUTOFF_QUESTION, headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert lotte.post("/api/ask", json=CUTOFF_QUESTION, headers={"Sec-Fetch-Site": "same-origin"}).status_code == 200

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


def test_resolving_closes_only_the_resolvers_own_requests_for_that_context(make_client):
    client = make_client()
    lotte, ellen, pieter = (login(client, user) for user in ("lotte", "ellen", "pieter"))
    body = {"topic_id": "payroll.variables_cutoff", "client_id": None, "question": "Cut-off?"}
    lottes = lotte.post("/api/verifications", json=body).json()
    ellens = ellen.post("/api/verifications", json=body).json()
    assert (lottes["assignee_name"], ellens["assignee_name"]) == ("Ellen Maes", "Pieter De Smet")

    resolution = {"value": "25", "note": "Contract addendum", "valid_until": str(TODAY + timedelta(days=180))}
    assert ellen.post(f"/api/verifications/{lottes['id']}/resolve", json=resolution).status_code == 200
    # Pieter's request is his to answer: another expert's resolution never closes it.
    other = {**resolution, "value": "20"}
    assert pieter.post(f"/api/verifications/{ellens['id']}/resolve", json=other).status_code == 200


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


def test_client_request_is_never_routed_outside_the_client_team(make_client):
    # Ellen is the only expert on the Van Dam team, so her own request must not go to Pieter.
    ellen = login(make_client(), "ellen")
    response = ellen.post(
        "/api/verifications",
        json={"topic_id": "payroll.variables_cutoff", "client_id": "vandam", "question": "Cut-off?"},
    )
    assert response.status_code == 422


def test_cycling_usernames_from_one_ip_is_capped(make_client):
    client = make_client()
    for attempt in range(30):
        response = client.post("/api/login", json={"username": f"nobody{attempt}", "password": "x"})
        assert response.status_code == 401
    blocked = client.post("/api/login", json={"username": "lotte", "password": password_for("lotte")})
    assert blocked.status_code == 429


def test_every_login_attempt_counts_per_ip_but_successes_give_theirs_back(make_client):
    client = make_client()
    for attempt in range(LOGIN_MAX_FAILURES_PER_IP - 1):
        response = client.post("/api/login", json={"username": f"nobody{attempt}", "password": "x"})
        assert response.status_code == 401
    ok = client.post("/api/login", json={"username": "lotte", "password": password_for("lotte")})
    assert ok.status_code == 200
    # The success released its slot, so one more attempt still reaches the password check.
    assert client.post("/api/login", json={"username": "nobody-last", "password": "x"}).status_code == 401
    assert client.post("/api/login", json={"username": "lotte", "password": password_for("lotte")}).status_code == 429


def test_sessions_expire_server_side_and_are_purged(make_client):
    now = [1000.0]
    client = make_client(monotonic=lambda: now[0])
    lotte = login(client, "lotte")
    assert lotte.get("/api/me").status_code == 200
    assert len(client.app.state.sessions) == 1

    now[0] += SESSION_MAX_AGE_SECONDS
    assert lotte.get("/api/me").status_code == 401
    assert client.app.state.sessions == {}
