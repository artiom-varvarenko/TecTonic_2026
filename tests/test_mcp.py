from conftest import login
from fastapi.testclient import TestClient
from test_capture import MESSAGE, StubExtractor

CUTOFF_QUESTION = "What's the cut-off for submitting overtime this month?"


def connect(user_client: TestClient) -> str:
    response = user_client.post("/api/connections/teams")
    assert response.status_code == 201
    return response.json()["token"]


def rpc(teams: TestClient, token: str | None, method: str, params: dict | None = None, **headers):
    """One JSON-RPC request on a cookie-less client, as Copilot Studio sends it."""
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    message = {"jsonrpc": "2.0", "id": 1, "method": method}
    if params is not None:
        message["params"] = params
    return teams.post("/mcp", json=message, headers=headers)


def call(teams: TestClient, token: str, tool: str, **arguments) -> dict:
    response = rpc(teams, token, "tools/call", {"name": tool, "arguments": arguments})
    assert response.status_code == 200, response.text
    return response.json()["result"]


def test_token_authorizes_ask_scoped_to_the_token_users_portfolio(make_client):
    app_client = make_client()
    token = connect(login(app_client, "lotte"))
    teams = TestClient(app_client.app)

    denied = rpc(teams, None, "initialize", {"protocolVersion": "2025-06-18"})
    assert denied.status_code == 401
    assert denied.headers["www-authenticate"] == 'Bearer realm="trustlabel"'
    assert denied.json()["error"]["code"] == -32001

    init = rpc(teams, token, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}})
    assert init.json()["result"]["protocolVersion"] == "2025-06-18"
    tools = rpc(teams, token, "tools/list").json()["result"]["tools"]
    assert "ask_trustlabel" in [t["name"] for t in tools]

    result = call(teams, token, "ask_trustlabel", question=CUTOFF_QUESTION, client="Van Dam")
    assert result["isError"] is False
    assert result["structuredContent"]["answer"]["status"] == "conflict"
    assert result["structuredContent"]["context"]["client_id"] == "vandam"
    assert "Don't act yet" in result["content"][0]["text"]

    foreign = call(teams, token, "ask_trustlabel", question=CUTOFF_QUESTION, client="noordhaven")
    assert foreign["isError"] is True
    assert foreign["content"][0]["text"] == "Client is not in your portfolio"


def test_only_the_current_token_authorizes_and_usage_is_reported(make_client):
    app_client = make_client()
    lotte = login(app_client, "lotte")
    assert rpc(lotte, None, "ping").status_code == 401  # a session cookie is not an MCP credential

    first = connect(lotte)
    second = connect(lotte)
    assert rpc(lotte, first, "ping").status_code == 401
    assert rpc(lotte, second, "ping").json()["result"] == {}
    assert rpc(lotte, None, "ping", **{"X-API-Key": second}).status_code == 200

    teams = lotte.get("/api/connections").json()["teams"]
    assert teams["connected"] is True
    assert teams["calls"] == 2
    assert teams["last_used_at"] is not None

    assert lotte.delete("/api/connections/teams").status_code == 204
    assert rpc(lotte, second, "ping").status_code == 401
    assert lotte.get("/api/connections").json()["teams"]["connected"] is False


def test_request_verification_lands_in_the_experts_inbox(make_client):
    app_client = make_client()
    token = connect(login(app_client, "lotte"))

    result = call(TestClient(app_client.app), token, "request_verification", question=CUTOFF_QUESTION, client="vandam")
    assert result["isError"] is False
    assert result["structuredContent"]["created"] is True

    inbox = login(app_client, "ellen").get("/api/verifications").json()["items"]
    assert [(v["status"], v["is_assignee"], v["requester_name"]) for v in inbox] == [
        ("open", True, "Lotte Janssens")
    ]
    assert inbox[0]["context_label"] == "Van Dam Logistics NV (BE)"


def test_protocol_errors(make_client):
    app_client = make_client()
    token = connect(login(app_client, "lotte"))
    teams = TestClient(app_client.app)
    auth = {"Authorization": f"Bearer {token}"}

    notification = teams.post("/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"}, headers=auth)
    assert (notification.status_code, notification.content) == (202, b"")
    assert rpc(teams, token, "resources/list").json()["error"]["code"] == -32601
    unknown_tool = rpc(teams, token, "tools/call", {"name": "delete_everything", "arguments": {}})
    assert unknown_tool.json()["error"]["code"] == -32602
    extra_key = rpc(teams, token, "tools/call", {"name": "ask_trustlabel", "arguments": {"question": "x", "as": "ellen"}})
    assert extra_key.json()["error"]["code"] == -32602

    batch = teams.post("/mcp", json=[{"jsonrpc": "2.0", "id": 1, "method": "ping"}], headers=auth)
    assert (batch.status_code, batch.json()["error"]["code"]) == (400, -32600)
    assert teams.get("/mcp").status_code == 405


def test_capture_tool_is_offered_only_with_an_extractor(make_client):
    without = make_client()
    token = connect(login(without, "lotte"))
    tools = rpc(TestClient(without.app), token, "tools/list").json()["result"]["tools"]
    assert "capture_teams_message" not in [t["name"] for t in tools]

    with_extractor = make_client(StubExtractor("close on the 8th"))
    token = connect(login(with_extractor, "lotte"))
    result = call(TestClient(with_extractor.app), token, "capture_teams_message", text=MESSAGE, client="vandam")
    assert result["isError"] is False
    captured_id = result["structuredContent"]["captured_item_id"]
    assert captured_id in [s["id"] for s in result["structuredContent"]["result"]["sources"]]
