import json

import httpx
from conftest import login
from test_channels import CUTOFF, pane
from test_teams_alerts import StubTeams, settle

from trustlabel.claude import MESSAGES_URL, ClaudeClient, DraftCandidate, check_draft, template_question

CUTOFF_TOPIC = "payroll.variables_cutoff"
SICK_TOPIC = "leave.sick_certificate"
VAN_DAM = "Van Dam Logistics NV (BE)"
DRAFT = (
    "For Van Dam Logistics NV (BE), is the payroll variables cut-off the 20th of the month (grade C) "
    "or the 25th of the month (grade D)?"
)


def claude_stub(reply: str | None = None, status: int = 200) -> tuple[ClaudeClient, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if status != 200:
            return httpx.Response(status, json={"type": "error"})
        return httpx.Response(200, json={"content": [{"type": "text", "text": reply}]})

    return ClaudeClient("test-key", "claude-test", transport=httpx.MockTransport(handler)), seen


def expected_template(sources: list[dict]) -> str:
    effective = [s for s in sources if s["status"] == "effective"]
    return template_question(
        VAN_DAM,
        "Payroll variables cut-off",
        [DraftCandidate(s["value_display"], s["title"], s["grade"]) for s in effective],
    )


def ask(user_client, topic_id: str, client_id: str | None, auto_ask: bool = True) -> dict:
    response = user_client.post(
        "/api/ask", json={"question": CUTOFF, "topic_id": topic_id, "client_id": client_id, "auto_ask": auto_ask}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_the_drafted_question_reaches_the_verification_and_the_teams_alert(make_client):
    claude, seen = claude_stub(DRAFT)
    teams = StubTeams()
    app_client = make_client(teams_alerts=teams, claude=claude)
    request = {"topic_id": CUTOFF_TOPIC, "client_id": "vandam", "question": CUTOFF}
    created = pane(app_client).post("/api/v1/verifications", json=request)
    assert created.status_code == 201
    settle(app_client)

    [call] = seen
    assert str(call.url) == MESSAGES_URL
    assert call.headers["x-api-key"] == "test-key" and call.headers["anthropic-version"] == "2023-06-01"
    body = json.loads(call.content)
    # Current Claude models reject `temperature` (400), which silently forced the template every time.
    assert body["model"] == "claude-test" and "temperature" not in body and body["max_tokens"] <= 300
    prompt = body["messages"][0]["content"]
    assert VAN_DAM in prompt and "20th of the month" in prompt and "25th of the month" in prompt

    [payload] = teams.payloads
    facts = {f["title"]: f["value"] for f in payload["attachments"][0]["content"]["body"][2]["facts"]}
    assert facts["Question"] == DRAFT

    [item] = login(app_client, "ellen").get("/api/verifications").json()["items"]
    assert (item["question"], item["asked"]) == (DRAFT, CUTOFF)


def test_a_failing_or_incomplete_draft_falls_back_to_the_template(make_client, caplog):
    missing_value = "For Van Dam Logistics NV (BE), is the cut-off the 20th of the month (grade C)?"
    for claude, _ in (claude_stub(status=529), claude_stub(missing_value), claude_stub(DRAFT + " Or the 1st?")):
        lotte = login(make_client(claude=claude), "lotte")
        result = ask(lotte, CUTOFF_TOPIC, "vandam")
        question = result["auto_request"]["question"]
        assert question == expected_template(result["sources"])
    assert question.startswith(f"Which is right for {VAN_DAM}: payroll variables cut-off 20th of the month (")
    assert "25th of the month (" in question and "grade D)?" in question
    assert "Claude draft failed: HTTPStatusError" in caplog.text
    assert "test-key" not in caplog.text


def test_without_a_key_the_template_names_a_gap():
    gap = template_question(VAN_DAM, "Sick leave certificate deadline", [])
    assert gap == f"What is the sick leave certificate deadline for {VAN_DAM}? No current source covers it."
    values = [DraftCandidate("20th of the month", "Policy", "C"), DraftCandidate("25th of the month", "Mail", "D")]
    assert check_draft("a\nb", VAN_DAM, "Topic", values) is None
    assert check_draft("x" * 301 + " 20th of the month 25th of the month", VAN_DAM, "Topic", values) is None
    assert check_draft(DRAFT, VAN_DAM, "Payroll variables cut-off", values) == DRAFT


def test_auto_ask_creates_one_request_across_two_asks_and_two_users(make_client):
    app_client = make_client()
    lotte, jonas = login(app_client, "lotte"), login(app_client, "jonas")

    first = ask(lotte, CUTOFF_TOPIC, "vandam")
    assert first["answer"]["action"] == "ask_expert"
    auto = first["auto_request"]
    assert auto["assignee_name"] == "Ellen Maes" and auto["status"] == "open"
    assert auto["asked"] == CUTOFF and auto["question"] == expected_template(first["sources"])
    assert first["open_request"]["id"] == auto["id"]

    again = ask(lotte, CUTOFF_TOPIC, "vandam")
    assert again["auto_request"] is None and again["open_request"]["id"] == auto["id"]

    other = ask(jonas, CUTOFF_TOPIC, "vandam")
    assert other["auto_request"]["id"] == auto["id"]
    assert ask(jonas, CUTOFF_TOPIC, "vandam")["open_request"]["id"] == auto["id"]

    assert len(app_client.app.state.store.verifications) == 1
    assert [v["id"] for v in jonas.get("/api/verifications").json()["items"]] == [auto["id"]]


def test_a_gap_is_auto_asked_with_the_gap_template(make_client):
    lotte = login(make_client(), "lotte")
    result = ask(lotte, SICK_TOPIC, "vandam")
    assert result["answer"]["status"] == "gap"
    assert result["auto_request"]["question"] == (
        f"What is the sick leave certificate deadline for {VAN_DAM}? No current source covers it."
    )


def test_a_safe_answer_or_auto_ask_off_never_asks(make_client):
    app_client = make_client()
    lotte = login(app_client, "lotte")
    safe = ask(lotte, CUTOFF_TOPIC, "brightwave")
    assert safe["answer"]["action"] == "use" and safe["auto_request"] is None
    off = ask(lotte, CUTOFF_TOPIC, "vandam", auto_ask=False)
    assert off["answer"]["action"] == "ask_expert" and off["auto_request"] is None
    assert app_client.app.state.store.verifications == {}


def test_integrations_show_how_questions_are_drafted(make_client):
    assert login(make_client(), "lotte").get("/api/integrations").json()["auto_ask"] == {
        "drafting": "template",
        "model": None,
    }
    claude, _ = claude_stub(DRAFT)
    on = login(make_client(claude=claude), "lotte").get("/api/integrations").json()["auto_ask"]
    assert on["drafting"] == "claude" and on["model"]
