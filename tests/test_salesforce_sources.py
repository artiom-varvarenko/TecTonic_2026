from datetime import UTC, date, datetime
from urllib.parse import parse_qs

import httpx
from conftest import login

from trustlabel.ai import ExtractedClaim
from trustlabel.salesforce import HttpSalesforceApi, SalesforceSource

DOMAIN = "acme.my.salesforce.com"
INSTANCE = "https://acme.my.salesforce.com"
USER_ID = "005XX0000004321AAA"
CASE_ID = "500XX0000012345AAA"
CALL_ID = "00TXX0000012345AAA"
EMAIL_TASK_ID = "00TXX0000067890AAA"
QUOTE = "close on the 8th"
SINCE = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)


def comments(*rows):
    return {"totalSize": len(rows), "done": True, "records": [{"CommentBody": b, "CreatedById": u} for b, u in rows]}


CASE_RECORD = {
    "Id": CASE_ID,
    "CaseNumber": "00001026",
    "Subject": "Meal vouchers",
    "Description": "Client asked when the order closes.",
    "SuppliedEmail": None,
    "ClosedDate": "2026-10-19T16:00:00.000+0000",
    "LastModifiedDate": "2026-10-20T09:31:12.000+0000",
    "Account": {"Name": "Brightwave Retail BV"},
    "CaseComments": comments(
        ("Confirmed: orders close on the 8th.", "005XX0000009999AAA"),
        ("TrustLabel brief: verdict and sources", USER_ID),
    ),
}
CALL_RECORD = {
    "Id": CALL_ID,
    "TaskSubtype": "Call",
    "Subject": "Inbound call",
    "Description": "Orders close on the 8th.",
    "CreatedDate": "2026-10-20T08:15:00.000+0000",
    "LastModifiedDate": "2026-10-20T08:20:00.000+0000",
    "Account": None,
    "What": {"Name": "Noordhaven Zorg B.V."},
    "Who": {"Name": "Jan Jansen"},
}
EMAIL_TASK = {**CALL_RECORD, "Id": EMAIL_TASK_ID, "TaskSubtype": "Email"}


class FakeSalesforce:
    def __init__(self):
        self.queries = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/services/oauth2/token":
            return httpx.Response(
                200,
                json={
                    "access_token": "tok",
                    "instance_url": INSTANCE,
                    "id": f"https://login.salesforce.com/id/00DXX0000001234AAA/{USER_ID}",
                },
            )
        soql = parse_qs(request.url.query.decode())["q"][0]
        self.queries.append(soql)
        records = [CASE_RECORD] if "FROM Case" in soql else [CALL_RECORD, EMAIL_TASK]
        return httpx.Response(200, json={"records": records})


def test_closed_cases_soql_and_own_comments_excluded():
    fake = FakeSalesforce()
    api = HttpSalesforceApi(DOMAIN, "cid", "secret", transport=httpx.MockTransport(fake))
    [case] = api.closed_cases(SINCE)
    soql = fake.queries[0]
    assert "FROM Case WHERE IsClosed = true AND LastModifiedDate > 2026-10-20T09:00:00Z" in soql
    assert f"FROM CaseComments WHERE CreatedById != '{USER_ID}'" in soql
    assert case.kind == "salesforce_case"
    assert case.title == "Case 00001026: Meal vouchers"
    assert case.source == "Salesforce · case 00001026 (Brightwave Retail BV)"
    assert case.text == "Meal vouchers\nClient asked when the order closes.\nConfirmed: orders close on the 8th."
    assert "TrustLabel brief" not in case.text
    assert case.happened_on == date(2026, 10, 19)


def test_call_logs_soql_and_non_call_task_ignored():
    fake = FakeSalesforce()
    api = HttpSalesforceApi(DOMAIN, "cid", "secret", transport=httpx.MockTransport(fake))
    [call] = api.call_logs(SINCE)
    assert "FROM Task WHERE TaskSubtype = 'Call' AND LastModifiedDate > 2026-10-20T09:00:00Z" in fake.queries[0]
    assert call.id == CALL_ID
    assert call.kind == "phone_call"
    assert call.title == "Call: Inbound call"
    assert call.source == "Salesforce · call logged 2026-10-20 (Noordhaven Zorg B.V.)"
    assert call.text == "Inbound call\nOrders close on the 8th."


def source(source_id, kind, account, text=f"Orders {QUOTE}."):
    return SalesforceSource(
        id=source_id,
        kind=kind,
        title=f"{kind} {source_id}",
        source=f"Salesforce · {source_id}",
        text=text,
        account_name=account,
        supplied_email=None,
        happened_on=date(2026, 9, 29),
        changed_at=datetime.now(UTC),  # after the poller's start watermark (now minus the lookback)
    )


class StubSalesforce:
    def __init__(self, cases, calls):
        self.cases = cases
        self.calls = calls
        self.since = []

    def new_cases(self, since):
        return []

    def add_case_comment(self, case_id, body):
        raise AssertionError("sources sync never comments")

    def closed_cases(self, since):
        self.since.append(since)
        return self.cases

    def call_logs(self, since):
        return self.calls


class StubExtractor:
    def __init__(self):
        self.texts = []

    def extract(self, text, topics, today):
        self.texts.append(text)
        return [ExtractedClaim(topic_id="payroll.meal_vouchers_order", value="8", quote=QUOTE, valid_until=None)]


MAPPED_CASE = source("500XX0000000001AAA", "salesforce_case", "Brightwave Retail BV")
UNMAPPED_CASE = source("500XX0000000002AAA", "salesforce_case", "Acme Unknown Corp")
CALL = source("00TXX0000000003AAA", "phone_call", "Noordhaven Zorg B.V.")


def new_items(client, before):
    return {i.id: i for i in client.app.state.store.items() if i.id not in before}


def test_sources_become_client_scoped_items_once(make_client):
    extractor = StubExtractor()
    salesforce = StubSalesforce([MAPPED_CASE, UNMAPPED_CASE], [CALL])
    client = make_client(extractor, salesforce=salesforce, salesforce_domain=DOMAIN)
    poller = client.app.state.source_poller
    before = {i.id for i in client.app.state.store.items()}

    assert poller.poll_once() == 2
    call_item, case_item = sorted(new_items(client, before).values(), key=lambda i: i.kind)
    assert (case_item.kind, case_item.client_ids, case_item.countries) == ("salesforce_case", ["brightwave"], ["BE"])
    assert case_item.title == f"salesforce_case {MAPPED_CASE.id}"
    assert case_item.created_on == date(2026, 9, 29)
    assert case_item.claims[0].quote == QUOTE
    assert (call_item.kind, call_item.client_ids, call_item.countries) == ("phone_call", ["noordhaven"], ["NL"])
    # The unmapped account is skipped before any AI call.
    assert len(extractor.texts) == 2

    # Dedupe: the same records on the next poll are not extracted again; the watermark moved.
    assert poller.poll_once() == 0
    assert len(extractor.texts) == 2
    assert salesforce.since[1] == UNMAPPED_CASE.changed_at  # skipped records move the watermark too
    assert poller.sources_synced == 2


def test_client_from_text_when_account_unknown(make_client):
    text = f"Brightwave payroll: orders {QUOTE}."
    salesforce = StubSalesforce([], [source("00TXX0000000004AAA", "phone_call", None, text)])
    client = make_client(StubExtractor(), salesforce=salesforce, salesforce_domain=DOMAIN)
    before = {i.id for i in client.app.state.store.items()}
    assert client.app.state.source_poller.poll_once() == 1
    [item] = new_items(client, before).values()
    assert item.client_ids == ["brightwave"]


def test_sources_sync_needs_extractor_and_shows_on_integrations(make_client):
    salesforce = StubSalesforce([MAPPED_CASE], [])
    without = make_client(salesforce=salesforce, salesforce_domain=DOMAIN)
    assert without.app.state.source_poller is None
    sf = login(without, "lotte").get("/api/integrations").json()["salesforce"]
    assert sf["sources_sync"] is False

    with_ai = make_client(StubExtractor(), salesforce=salesforce, salesforce_domain=DOMAIN)
    with_ai.app.state.source_poller.poll_once()
    sf = login(with_ai, "lotte").get("/api/integrations").json()["salesforce"]
    assert sf["sources_sync"] is True
    assert sf["sources_synced"] == 1
    assert sf["sources_last_error"] is None
