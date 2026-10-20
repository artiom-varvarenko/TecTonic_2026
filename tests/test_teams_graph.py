from datetime import UTC, datetime
from urllib.parse import parse_qs

import httpx
import pytest
from conftest import login

from trustlabel.ai import ExtractedClaim
from trustlabel.config import ms_graph_from_env
from trustlabel.teams_graph import ChannelRef, ChannelSyncPoller, HttpGraphApi, html_to_text, parse_sync_channels

TEAM = "11111111-2222-3333-4444-555555555555"
CHANNEL = "19:abc123@thread.tacv2"
REF = ChannelRef(TEAM, CHANNEL)
GRAPH = "https://graph.microsoft.com/v1.0"
CHANNEL_PATH = f"/v1.0/teams/{TEAM}/channels/{CHANNEL}"  # httpx exposes the decoded path
DELTA_PATH = f"{CHANNEL_PATH}/messages/delta"
NEXT_LINK = f"{GRAPH}/teams/{TEAM}/channels/x/messages/delta?$skiptoken=page2"
DELTA_LINK = f"{GRAPH}/teams/{TEAM}/channels/x/messages/delta?$deltatoken=round1"
NOW = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)
LOTTE_GRAPH_ID = "aaaaaaaa-0000-0000-0000-000000000001"
GUEST_GRAPH_ID = "bbbbbbbb-0000-0000-0000-000000000002"
QUOTE = "close on the 8th"


def user_message(msg_id: str, html: str, author_id: str = LOTTE_GRAPH_ID, name: str = "Lotte") -> dict:
    return {
        "id": msg_id,
        "messageType": "message",
        "deletedDateTime": None,
        "createdDateTime": "2026-09-29T08:15:00.123Z",
        "lastModifiedDateTime": "2026-09-29T08:15:00.123Z",
        "webUrl": f"https://teams.microsoft.com/l/message/{msg_id}",
        "from": {"user": {"id": author_id, "displayName": name, "userIdentityType": "aadUser"}, "application": None},
        "body": {"contentType": "html", "content": html},
    }


SYSTEM_MESSAGE = {
    "id": "1700000000002",
    "messageType": "systemEventMessage",
    "createdDateTime": "2026-09-29T08:00:00Z",
    "from": None,
    "body": {"contentType": "html", "content": "<systemEventMessage/>"},
}
DELETED_MESSAGE = {**user_message("1700000000003", "<p>oops</p>"), "deletedDateTime": "2026-09-29T09:00:00Z"}
CLAIM_MESSAGE = user_message("1700000000001", "<p>From November meal voucher orders <b>close on the 8th</b>.</p>")


class FakeGraph:
    """Microsoft Graph over httpx.MockTransport: token, two delta pages, then an incremental round."""

    def __init__(self, first_page: list[dict], second_page: list[dict], next_round: list[dict]) -> None:
        self.pages = {"first": first_page, "second": second_page, "next": next_round}
        self.requests: list[httpx.Request] = []
        self.token_posts = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = str(request.url)
        if request.url.host == "login.microsoftonline.com":
            self.token_posts += 1
            return httpx.Response(200, json={"access_token": f"tok{self.token_posts}", "expires_in": 3599})
        assert request.headers["Authorization"].startswith("Bearer tok")
        if request.url.path == DELTA_PATH:
            return httpx.Response(200, json={"value": self.pages["first"], "@odata.nextLink": NEXT_LINK})
        if "skiptoken=page2" in url:
            return httpx.Response(200, json={"value": self.pages["second"], "@odata.deltaLink": DELTA_LINK})
        if "deltatoken=round1" in url:
            return httpx.Response(200, json={"value": self.pages["next"], "@odata.deltaLink": DELTA_LINK})
        if request.url.path == f"/v1.0/users/{LOTTE_GRAPH_ID}":
            return httpx.Response(200, json={"userPrincipalName": "Lotte@SDWorx.example", "mail": None})
        if request.url.path == f"/v1.0/users/{GUEST_GRAPH_ID}":
            return httpx.Response(200, json={"userPrincipalName": "guest_ext#EXT#@x.example", "mail": "g@x.example"})
        if request.url.path == f"/v1.0/teams/{TEAM}":
            return httpx.Response(200, json={"displayName": "Payroll BE"})
        if request.url.path == CHANNEL_PATH:
            return httpx.Response(200, json={"displayName": "General"})
        return httpx.Response(404, json={"error": {"code": "NotFound"}})

    def api(self, monotonic=lambda: 0.0) -> HttpGraphApi:
        transport = httpx.MockTransport(self.handler)
        return HttpGraphApi("contoso.onmicrosoft.com", "app-id", "app-secret", transport=transport, monotonic=monotonic)

    def delta_requests(self) -> list[httpx.Request]:
        return [r for r in self.requests if "/messages/delta" in r.url.path]


class StubExtractor:
    def __init__(self, claims: bool = True) -> None:
        self.claims = claims
        self.texts: list[str] = []

    def extract(self, text, topics, today):
        self.texts.append(text)
        if not self.claims:
            return []
        return [ExtractedClaim(topic_id="payroll.meal_vouchers_order", value="8", quote=QUOTE, valid_until=None)]


def test_token_request_shape_and_cache():
    graph = FakeGraph([], [], [])
    clock = [0.0]
    api = graph.api(monotonic=lambda: clock[0])

    assert api.user_addresses(LOTTE_GRAPH_ID) == ("lotte@sdworx.example",)
    api.user_addresses(LOTTE_GRAPH_ID)
    token_requests = [r for r in graph.requests if r.method == "POST"]
    assert len(token_requests) == 1
    token = token_requests[0]
    assert str(token.url) == "https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token"
    assert parse_qs(token.content.decode()) == {
        "grant_type": ["client_credentials"],
        "client_id": ["app-id"],
        "client_secret": ["app-secret"],
        "scope": ["https://graph.microsoft.com/.default"],
    }
    user_request = graph.requests[1]
    assert user_request.headers["Authorization"] == "Bearer tok1"
    assert user_request.url.params["$select"] == "userPrincipalName,mail"

    clock[0] = 3599 - 299  # inside the renewal margin
    api.user_addresses(LOTTE_GRAPH_ID)
    assert graph.token_posts == 2
    assert graph.requests[-1].headers["Authorization"] == "Bearer tok2"


def test_delta_paging_then_delta_link_reused_and_system_and_deleted_skipped():
    graph = FakeGraph([SYSTEM_MESSAGE, CLAIM_MESSAGE], [DELETED_MESSAGE], [CLAIM_MESSAGE])
    seen = []
    poller = ChannelSyncPoller(graph.api(), [REF], lambda m: seen.append(m) or None, now=lambda: NOW)

    poller.poll_once()
    first, second = graph.delta_requests()
    assert first.url.params["$filter"] == "lastModifiedDateTime gt 2026-08-31T12:00:00.000Z"
    assert str(second.url) == NEXT_LINK
    assert [m.message.id for m in seen] == ["1700000000001"]
    synced = seen[0]
    assert synced.message.text == "From November meal voucher orders close on the 8th."
    assert synced.author_addresses == ("lotte@sdworx.example",)
    assert (synced.team_name, synced.channel_name) == ("Payroll BE", "General")
    assert synced.message.web_url == "https://teams.microsoft.com/l/message/1700000000001"

    poller.poll_once()
    assert str(graph.delta_requests()[2].url) == DELTA_LINK
    assert len(graph.delta_requests()) == 3
    assert len(seen) == 1  # the replayed message was already processed
    assert poller.messages_seen == 1 and poller.last_error is None


def test_non_graph_next_link_is_refused_without_sending_the_token():
    graph = FakeGraph([], [], [])
    original = graph.handler

    def handler(request):
        if request.url.path == DELTA_PATH:
            graph.requests.append(request)
            return httpx.Response(200, json={"value": [], "@odata.nextLink": "https://evil.example/steal"})
        return original(request)

    api = HttpGraphApi("contoso.onmicrosoft.com", "a", "s", transport=httpx.MockTransport(handler))
    poller = ChannelSyncPoller(api, [REF], lambda m: None, now=lambda: NOW)
    poller.poll_once()
    assert poller.last_error == "ValueError"
    assert all(r.url.host != "evil.example" for r in graph.requests)


def synced_items(client, before: set[str]) -> list:
    return [i for i in client.app.state.store.items() if i.id not in before]


def sync_client(make_client, extractor, graph):
    return make_client(
        extractor,
        graph=graph.api(),
        teams_sync_channels=(REF,),
        teams_users={"lotte": "lotte@sdworx.example"},
    )


def test_message_with_claim_becomes_one_item_across_two_polls(make_client):
    graph = FakeGraph([SYSTEM_MESSAGE, CLAIM_MESSAGE], [], [CLAIM_MESSAGE])
    extractor = StubExtractor()
    client = sync_client(make_client, extractor, graph)
    poller = client.app.state.teams_sync
    before = {i.id for i in client.app.state.store.items()}

    assert poller.poll_once() == 1
    assert poller.poll_once() == 0
    items = synced_items(client, before)
    assert len(items) == 1
    item = items[0]
    assert (item.kind, item.author_id, item.source) == ("teams_message", "lotte", "Teams · Payroll BE/General")
    assert item.countries == ["BE"] and item.client_ids == []
    assert [(c.value, c.quote) for c in item.claims] == [("8", QUOTE)]
    assert len(extractor.texts) == 1

    status = login(client, "lotte").get("/api/integrations").json()["teams"]["sync"]
    assert status["configured"] is True
    assert (status["channels"], status["messages_seen"], status["items_created"]) == (1, 1, 1)
    assert status["permissions"] == ["ChannelMessage.Read.All", "User.Read.All"]


def test_unknown_author_is_recorded_as_external(make_client):
    guest = user_message("1700000000009", "<div>Orders <i>close on the 8th</i> now</div>", GUEST_GRAPH_ID, "Guest")
    client = sync_client(make_client, StubExtractor(), FakeGraph([guest], [], []))
    before = {i.id for i in client.app.state.store.items()}
    client.app.state.teams_sync.poll_once()
    [item] = synced_items(client, before)
    assert item.author_id is None
    assert item.title == "Guest (external) in General"


def test_message_without_claims_creates_no_item(make_client):
    extractor = StubExtractor(claims=False)
    client = sync_client(make_client, extractor, FakeGraph([CLAIM_MESSAGE], [], []))
    poller = client.app.state.teams_sync
    before = {i.id for i in client.app.state.store.items()}

    assert poller.poll_once() == 0
    assert extractor.texts == ["From November meal voucher orders close on the 8th."]
    assert not synced_items(client, before)
    assert (poller.messages_seen, poller.items_created) == (1, 0)


def test_html_to_text_keeps_text_and_drops_markup():
    html = (
        '<p>Hi <at id="0">Philip</at>,</p><p>rate is &euro;750&nbsp;per month<br>ok?</p>'
        '<attachment id="x"></attachment><script>alert(1)</script>'
    )
    assert html_to_text(html) == "Hi Philip,\nrate is €750 per month\nok?"


def test_sync_channels_and_env_validation(monkeypatch):
    assert parse_sync_channels(f" {TEAM}/{CHANNEL} ,") == (REF,)
    with pytest.raises(ValueError):
        parse_sync_channels("no-slash")
    for name in ("MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "TEAMS_SYNC_CHANNELS"):
        monkeypatch.delenv(name, raising=False)
    assert ms_graph_from_env() == {}
    monkeypatch.setenv("MS_TENANT_ID", "contoso.onmicrosoft.com")
    with pytest.raises(SystemExit):
        ms_graph_from_env()
    monkeypatch.setenv("MS_CLIENT_ID", "app")
    monkeypatch.setenv("MS_CLIENT_SECRET", "secret")
    monkeypatch.setenv("TEAMS_SYNC_CHANNELS", f"{TEAM}/{CHANNEL}")
    assert ms_graph_from_env()["teams_sync_channels"] == (REF,)
