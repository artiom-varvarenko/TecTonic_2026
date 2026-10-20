import pytest
from conftest import login
from fastapi.testclient import TestClient
from test_capture import MESSAGE, StubExtractor
from test_mcp import call, connect, rpc

from trustlabel.app import CAPTURE_SOURCES, CAPTURE_TITLES
from trustlabel.engine import GRADES, KIND_LABELS

QUOTE = "close on the 8th"


def captured_source(body: dict) -> dict:
    return next(s for s in body["result"]["sources"] if s["id"] == body["captured_item_id"])


@pytest.mark.parametrize("kind", list(CAPTURE_TITLES))
def test_each_capture_kind_becomes_a_graded_source_of_that_kind(make_client, kind):
    lotte = login(make_client(StubExtractor(QUOTE)), "lotte")
    response = lotte.post("/api/capture", json={"text": MESSAGE, "client_id": "vandam", "kind": kind})

    assert response.status_code == 201, response.text
    source = captured_source(response.json())
    assert source["kind"] == kind
    assert source["kind_label"] == KIND_LABELS[kind]
    assert source["source"] == CAPTURE_SOURCES[kind]
    assert source["title"] == CAPTURE_TITLES[kind].format(name=source["author_name"])
    assert source["grade"] in GRADES


def test_meeting_summary_is_labelled_as_such(make_client):
    lotte = login(make_client(StubExtractor(QUOTE)), "lotte")
    summary = "Meeting recap — Van Dam payroll sync\nAgreed: from November meal voucher orders close on the 8th."
    response = lotte.post("/api/capture", json={"text": summary, "client_id": "vandam", "kind": "meeting_summary"})

    assert response.status_code == 201, response.text
    assert captured_source(response.json())["kind_label"] == "Meeting summary"


def test_capture_kind_defaults_to_teams_message(make_client):
    lotte = login(make_client(StubExtractor(QUOTE)), "lotte")
    response = lotte.post("/api/capture", json={"text": MESSAGE, "client_id": "vandam"})
    assert captured_source(response.json())["kind"] == "teams_message"


def test_invalid_capture_kind_is_rejected(make_client):
    lotte = login(make_client(StubExtractor(QUOTE)), "lotte")
    for kind in ("policy", "salesforce_case", "sms"):
        response = lotte.post("/api/capture", json={"text": MESSAGE, "client_id": "vandam", "kind": kind})
        assert response.status_code == 422


def test_capture_accepts_up_to_4000_characters(make_client):
    lotte = login(make_client(StubExtractor(QUOTE)), "lotte")
    padding = "x" * (4000 - len(MESSAGE) - 1)
    longest = f"{MESSAGE} {padding}"
    assert len(longest) == 4000

    ok = lotte.post("/api/capture", json={"text": longest, "client_id": "vandam", "kind": "email"})
    assert ok.status_code == 201, ok.text
    too_long = lotte.post("/api/capture", json={"text": longest + "x", "client_id": "vandam", "kind": "email"})
    assert too_long.status_code == 422


def test_mcp_capture_source_stores_the_given_kind(make_client):
    app_client = make_client(StubExtractor(QUOTE))
    token = connect(login(app_client, "lotte"))
    teams = TestClient(app_client.app)

    tools = {t["name"]: t for t in rpc(teams, token, "tools/list").json()["result"]["tools"]}
    assert "capture_teams_message" not in tools
    schema = tools["capture_source"]["inputSchema"]["properties"]
    assert schema["kind"]["enum"] == list(CAPTURE_TITLES)
    assert schema["text"]["maxLength"] == 4000

    result = call(teams, token, "capture_source", text=MESSAGE, client="vandam", kind="meeting_summary")
    assert result["isError"] is False
    source = captured_source(result["structuredContent"])
    assert (source["kind"], source["source"]) == ("meeting_summary", CAPTURE_SOURCES["meeting_summary"])

    default = call(teams, token, "capture_source", text="x " + MESSAGE, client="vandam")
    assert captured_source(default["structuredContent"])["kind"] == "teams_message"

    long_text = MESSAGE + " " + "x" * (4000 - len(MESSAGE) - 1)
    assert call(teams, token, "capture_source", text=long_text, client="vandam")["isError"] is False

    bad = rpc(teams, token, "tools/call", {"name": "capture_source", "arguments": {"text": MESSAGE, "kind": "policy"}})
    assert bad.json()["error"]["code"] == -32602
