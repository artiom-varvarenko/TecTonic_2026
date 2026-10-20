from datetime import UTC, datetime

import httpx
from conftest import login
from fastapi.testclient import TestClient
from test_mcp import connect
from test_spott import SECRET, StubExtractor, StubSpott, note_event, signed

from trustlabel.brief import detect_client
from trustlabel.salesforce import SalesforceCase
from trustlabel.spott import WEBHOOK_PATH

CUTOFF = "When is the cut-off for overtime this month?"


def pane(app_client: TestClient, username: str = "lotte") -> TestClient:
    """Cookie-less client carrying the user's personal key, the way the Outlook add-in calls TrustLabel."""
    key = connect(login(app_client, username))
    return TestClient(app_client.app, headers={"X-API-Key": key})


def brief(client: TestClient, **email) -> dict:
    response = client.post("/api/v1/brief", json=email)
    assert response.status_code == 200, response.text
    return response.json()


def test_channel_api_takes_the_personal_key_and_never_the_session_cookie(make_client):
    app_client = make_client()
    lotte = login(app_client, "lotte")
    denied = lotte.post("/api/v1/brief", json={"subject": CUTOFF})
    assert denied.status_code == 401 and denied.json() == {"detail": "Unauthorized"}
    assert lotte.get("/api/integrations").json()["key"]["active"] is False

    outlook = pane(app_client)
    me = outlook.get("/api/v1/me").json()
    assert me["id"] == "lotte" and {c["id"] for c in me["clients"]} == {"vandam", "brightwave"}
    assert lotte.get("/api/integrations").json()["key"]["active"] is True


def test_email_brief_matches_the_web_answer_for_the_senders_client(make_client):
    app_client = make_client()
    result = brief(pane(app_client), subject="Overtime", body=CUTOFF, sender="HR <hr@brightwave.example>")
    assert result["client"] == {"id": "brightwave", "name": "Brightwave Retail BV", "matched_by": "email_domain"}

    web = login(app_client, "lotte").post("/api/ask", json={"question": CUTOFF, "client_id": "brightwave"}).json()
    assert result["topic"] == web["topic"]
    keys = ("action", "status", "headline", "value_display", "grade")
    assert {k: result["answer"][k] for k in keys} == {k: web["answer"][k] for k in keys}
    assert result["answer"]["action"] == "use"
    assert result["reply"]["kind"] == "answer" and "the 20th of the month" in result["reply"]["text"]
    assert 0 < len(result["sources"]) <= 3 and all(s["status"] == "effective" for s in result["sources"])


def test_disputed_answer_gives_a_holding_reply_that_states_no_value(make_client):
    result = brief(pane(make_client()), subject="Van Dam overtime", body=CUTOFF, sender="someone@mail.example")
    assert result["client"]["id"] == "vandam" and result["client"]["matched_by"] == "name"
    assert result["answer"]["action"] == "ask_expert"
    assert result["reply"]["kind"] == "holding"
    assert len({s["value_display"] for s in result["sources"]}) > 1
    assert not any(s["value_display"] in result["reply"]["text"] for s in result["sources"])
    assert result["expert"]["name"] and result["expert"]["reasons"]


def test_client_is_detected_only_inside_the_portfolio_and_never_guessed(make_client):
    outlook = pane(make_client())
    both = brief(outlook, subject="Van Dam and Brightwave", body=CUTOFF)
    assert both["client"] is None and both["context_label"] == "Belgium — all clients"
    assert {c["id"] for c in both["clients"]} == {"vandam", "brightwave"}

    foreign = brief(outlook, subject="Overtime", body=CUTOFF, sender="hr@noordhaven-zorg.example")
    assert foreign["client"] is None
    chosen = outlook.post("/api/v1/brief", json={"body": CUTOFF, "client_id": "noordhaven"})
    assert chosen.status_code == 403

    chat = brief(outlook, subject="Lunch on Friday?", body="See you there")
    assert chat["matched"] is False and chat["answer"] is None and chat["reply"] is None


def test_client_detection_needs_a_whole_word_or_the_clients_own_domain(store):
    clients = list(store.clients.values())
    assert detect_client("Van Damme called about overtime", None, clients) == (None, None)
    assert detect_client("", "x@notbrightwave.example", clients) == (None, None)
    client, matched_by = detect_client("", "Payroll <payroll@hr.brightwave.example>", clients)
    assert (client.id, matched_by) == ("brightwave", "email_domain")
    # Outlook sends subjects with non-breaking spaces.
    client, matched_by = detect_client("Van\u00a0Dam: overtime this month", None, clients)
    assert (client.id, matched_by) == ("vandam", "name")


def test_asking_the_expert_from_outlook_reaches_the_expert_once(make_client):
    app_client = make_client()
    outlook = pane(app_client)
    body = {"topic_id": "payroll.variables_cutoff", "client_id": "vandam", "question": "Van Dam overtime cut-off?"}
    first = outlook.post("/api/v1/verifications", json=body)
    assert first.status_code == 201 and first.json()["status"] == "open"
    again = outlook.post("/api/v1/verifications", json=body)
    assert again.status_code == 200 and again.json()["id"] == first.json()["id"]

    assert brief(outlook, subject="Van Dam", body=CUTOFF)["open_request"]["id"] == first.json()["id"]
    inbox = login(app_client, "ellen").get("/api/verifications").json()["items"]
    assert [v["id"] for v in inbox if v["is_assignee"]] == [first.json()["id"]]


class StubSalesforce:
    def __init__(self, cases):
        self.cases = cases
        self.comments: dict[str, str] = {}

    def new_cases(self, since):
        return list(self.cases)

    def add_case_comment(self, case_id, body):
        self.comments[case_id] = body
        return "00a000000000001"


def case(case_id, subject, description="", account=None, email=None):
    return SalesforceCase(
        id=case_id,
        number=case_id[-4:],
        subject=subject,
        description=description,
        account_name=account,
        origin="Email",
        supplied_email=email,
        created_at=datetime.now(UTC),
    )


def test_new_salesforce_cases_get_an_internal_brief_for_their_client(make_client):
    salesforce = StubSalesforce(
        [
            case("500000000000001", "Overtime question", CUTOFF, email="hr@brightwave.example"),
            case("500000000000002", "Overtime question", CUTOFF, account="Van Dam Logistics NV"),
            case("500000000000003", "Overtime question", CUTOFF, email="someone@mail.example"),
            case("500000000000004", "Lunch", "See you on Friday"),
        ]
    )
    app_client = make_client(salesforce=salesforce, salesforce_domain="acme.my.salesforce.com")
    assert app_client.app.state.case_poller.poll_once() == 3

    safe, disputed, unscoped = (salesforce.comments[f"50000000000000{n}"] for n in (1, 2, 3))
    assert "Brightwave Retail BV" in safe and "Safe to use: 20th of the month" in safe
    assert "Van Dam Logistics NV" in disputed and "Don't act yet" in disputed
    assert "Suggested holding reply:" in disputed and "Who can verify:" in disputed
    assert "can't tell which client" in unscoped and "of the month" not in unscoped
    assert "500000000000004" not in salesforce.comments
    assert all(c.endswith("Nothing was sent to the client.") for c in salesforce.comments.values())

    status = login(app_client, "lotte").get("/api/integrations").json()["salesforce"]
    assert status["configured"] and status["cases_briefed"] == 3 and status["last_error"] is None


class WorkspaceSpott(StubSpott):
    """A Spott workspace reached with one API key; only `spott-good-key` is accepted."""

    def __init__(self, api_key):
        super().__init__(clients={"Brightwave Retail BV": "sp_bright"})
        self.api_key = api_key

    def count_users(self):
        if self.api_key != "spott-good-key":
            request = httpx.Request("GET", "https://api.spott.test/users")
            raise httpx.HTTPStatusError("401", request=request, response=httpx.Response(401, request=request))
        return 2


def test_only_admins_connect_spott_and_the_keys_never_come_back(make_client):
    app_client = make_client(StubExtractor(), spott_factory=WorkspaceSpott, admins=frozenset({"lotte"}))
    jonas = login(app_client, "jonas")
    assert jonas.post("/api/integrations/spott", json={"api_key": "spott-good-key"}).status_code == 403
    body, headers = signed(note_event())
    assert app_client.post(WEBHOOK_PATH, content=body, headers=headers).status_code == 404

    lotte = login(app_client, "lotte")
    wrong = lotte.post("/api/integrations/spott", json={"api_key": "wrong", "webhook_secret": SECRET})
    assert wrong.status_code == 400 and wrong.json()["detail"] == "Spott rejected this API key"
    not_whsec = lotte.post("/api/integrations/spott", json={"api_key": "spott-good-key", "webhook_secret": "abc"})
    assert not_whsec.status_code == 400

    connected = lotte.post("/api/integrations/spott", json={"api_key": "spott-good-key", "webhook_secret": SECRET})
    assert connected.status_code == 200
    spott = connected.json()
    assert (spott["connected"], spott["source"], spott["users"], spott["webhook_ready"]) == (True, "app", 2, True)
    assert {c["name"]: c["found"] for c in spott["clients"]} == {
        "Van Dam Logistics NV": False,
        "Brightwave Retail BV": True,
        "Noordhaven Zorg B.V.": False,
    }
    page = lotte.get("/api/integrations")
    assert "spott-good-key" not in page.text and SECRET not in page.text
    assert app_client.post(WEBHOOK_PATH, content=body, headers=headers).status_code == 202
    assert lotte.get("/api/integrations").json()["spott"]["last_delivery_at"] is not None

    assert lotte.delete("/api/integrations/spott").status_code == 204
    assert lotte.get("/api/integrations").json()["spott"]["connected"] is False
    body, headers = signed(note_event("note_2"), msg_id="msg_2")
    assert app_client.post(WEBHOOK_PATH, content=body, headers=headers).status_code == 404


def test_only_admins_see_the_spott_workspace_details(make_client):
    app_client = make_client(StubExtractor(), spott_factory=WorkspaceSpott, admins=frozenset({"lotte"}))
    lotte = login(app_client, "lotte")
    workspace = {"api_key": "spott-good-key", "webhook_secret": SECRET}
    assert lotte.post("/api/integrations/spott", json=workspace).status_code == 200

    seen = login(app_client, "jonas").get("/api/integrations").json()["spott"]
    assert seen == {"connected": True, "webhook_ready": True, "notes_captured": 0, "last_delivery_at": None}
    admin = lotte.get("/api/integrations").json()["spott"]
    assert admin["users"] == 2 and admin["webhook_url"].endswith(WEBHOOK_PATH)
    assert len(admin["clients"]) == 3
