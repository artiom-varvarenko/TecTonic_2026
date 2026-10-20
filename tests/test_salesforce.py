import json
from datetime import UTC, datetime
from urllib.parse import parse_qs

import httpx
import pytest

from trustlabel.salesforce import CasePoller, HttpSalesforceApi, SalesforceCase, check_domain

DOMAIN = "acme.my.salesforce.com"
INSTANCE = "https://acme.my.salesforce.com"
CASE_ID = "500XX0000012345AAA"
USER_ID = "005XX0000004321AAA"


def record(case_id=CASE_ID, created="2026-10-20T09:31:12.000+0000"):
    return {
        "Id": case_id,
        "CaseNumber": "00001001",
        "Subject": "Holiday pay",
        "Description": None,
        "Origin": "Email",
        "SuppliedEmail": "hr@brightwave.be",
        "CreatedDate": created,
        "Account": {"Name": "Brightwave Retail BV"},
    }


class Fake:
    def __init__(self, fail_first_api_call=False):
        self.tokens = []
        self.calls = []
        self.fail = fail_first_api_call

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/services/oauth2/token":
            self.tokens.append(parse_qs(request.content.decode()))
            return httpx.Response(
                200,
                json={
                    "access_token": f"tok{len(self.tokens)}",
                    "instance_url": INSTANCE,
                    "id": f"https://login.salesforce.com/id/00DXX0000001234AAA/{USER_ID}",
                },
            )
        self.calls.append(request)
        if self.fail:
            self.fail = False
            return httpx.Response(401, json=[{"errorCode": "INVALID_SESSION_ID"}])
        if request.method == "GET":
            return httpx.Response(200, json={"records": [record()]})
        return httpx.Response(201, json={"id": "00aXX000000ABCDEFG", "success": True})


def make(fake):
    return HttpSalesforceApi(DOMAIN, "cid", "secret", transport=httpx.MockTransport(fake))


def test_token_cached_and_soql_and_comment():
    fake = Fake()
    api = make(fake)
    cases = api.new_cases(datetime(2026, 10, 20, 11, 31, 12, tzinfo=datetime.now(UTC).astimezone().tzinfo))
    assert cases[0].account_name == "Brightwave Retail BV"
    assert cases[0].created_at == datetime(2026, 10, 20, 9, 31, 12, tzinfo=UTC)
    assert api.add_case_comment(CASE_ID, "x" * 5000) == "00aXX000000ABCDEFG"

    assert len(fake.tokens) == 1
    assert fake.tokens[0] == {"grant_type": ["client_credentials"], "client_id": ["cid"], "client_secret": ["secret"]}
    query = fake.calls[0].url.params["q"]
    assert "WHERE CreatedDate > " in query and query.endswith("ORDER BY CreatedDate ASC LIMIT 50")
    # Cases TrustLabel's own user already commented on are excluded, so restarts never comment twice.
    assert f"Id NOT IN (SELECT ParentId FROM CaseComment WHERE CreatedById = '{USER_ID}')" in query
    assert fake.calls[0].headers["Authorization"] == "Bearer tok1"
    body = json.loads(fake.calls[1].content)
    assert body == {"ParentId": CASE_ID, "CommentBody": "x" * 4000, "IsPublished": False}


def test_soql_watermark_is_utc_z():
    fake = Fake()
    make(fake).new_cases(datetime(2026, 10, 20, 9, 31, 12, 500000, tzinfo=UTC))
    assert "CreatedDate > 2026-10-20T09:31:12Z AND" in fake.calls[0].url.params["q"]


def test_401_reauthenticates_once_and_retries():
    fake = Fake(fail_first_api_call=True)
    assert make(fake).new_cases(datetime.now(UTC))[0].id == CASE_ID
    assert len(fake.tokens) == 2
    assert [c.headers["Authorization"] for c in fake.calls] == ["Bearer tok1", "Bearer tok2"]


def test_bad_case_id_rejected():
    with pytest.raises(ValueError):
        make(Fake()).add_case_comment("../evil", "hi")


class StubApi:
    def __init__(self, cases):
        self.cases = cases
        self.comments = []
        self.since = []
        self.error = None

    def new_cases(self, since):
        self.since.append(since)
        if self.error:
            raise self.error
        return self.cases

    def add_case_comment(self, case_id, body):
        self.comments.append((case_id, body))
        return "00a000000000001"


def case(case_id, minute):
    return SalesforceCase(case_id, "1", "s", "d", None, None, None, datetime(2026, 10, 20, 9, minute, tzinfo=UTC))


def test_poller_posts_once_skips_none_and_records_errors():
    now = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)
    api = StubApi([case("500000000000001", 1), case("500000000000002", 2)])
    poller = CasePoller(api, lambda c: None if c.id.endswith("2") else "brief", now=lambda: now)
    assert api.since == [] and poller.poll_once() == 1
    assert poller.poll_once() == 0  # overlapping poll returns the same cases
    assert api.comments == [("500000000000001", "brief")]
    assert poller.cases_briefed == 1
    assert api.since[0] == datetime(2026, 10, 20, 8, 58, tzinfo=UTC)
    assert api.since[1] == datetime(2026, 10, 20, 9, 2, tzinfo=UTC)

    api.error = httpx.ConnectError("boom")
    assert poller.poll_once() == 0
    assert poller.last_error == "ConnectError" and poller.last_poll_at == now


def test_poller_continues_after_on_case_failure():
    api = StubApi([case("500000000000001", 1), case("500000000000002", 2)])

    def on_case(c):
        if c.id.endswith("1"):
            raise RuntimeError("bad")
        return "ok"

    poller = CasePoller(api, on_case)
    assert poller.poll_once() == 1
    assert poller.last_error == "RuntimeError"


@pytest.mark.parametrize(
    "good",
    [
        "acme.my.salesforce.com",
        "ORGFARM-1a2b3c-dev-ed.develop.my.salesforce.com",
        "acme--uat.sandbox.my.salesforce.com",
    ],
)
def test_check_domain_accepts(good):
    assert check_domain(good) == good.lower()


@pytest.mark.parametrize(
    "bad",
    [
        "https://acme.my.salesforce.com",
        "acme.my.salesforce.com/x",
        "acme.my.salesforce.com:443",
        "u@acme.my.salesforce.com",
        "login.salesforce.com",
        "acme.my.salesforce.com.evil.com",
        "evil.com",
        "",
    ],
)
def test_check_domain_rejects(bad):
    with pytest.raises(ValueError):
        check_domain(bad)
