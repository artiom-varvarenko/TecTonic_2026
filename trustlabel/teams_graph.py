"""Microsoft Graph (app-only) connector: Teams channel messages in, through the capture pipeline, as graded sources.

Built against the Microsoft Graph v1.0 documentation (client credentials token, channel message delta query,
users lookup). Application permissions: ChannelMessage.Read.All and User.Read.All, with admin consent;
Team.ReadBasic.All and Channel.ReadBasic.All add the team and channel names to the source label.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from collections import deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from html.parser import HTMLParser
from typing import Protocol
from urllib.parse import quote

import httpx

log = logging.getLogger(__name__)

GRAPH = "https://graph.microsoft.com/v1.0"
LOGIN = "https://login.microsoftonline.com"
SCOPE = "https://graph.microsoft.com/.default"
PERMISSIONS = ("ChannelMessage.Read.All", "User.Read.All")
NAME_PERMISSIONS = ("Team.ReadBasic.All", "Channel.ReadBasic.All")
GRAPH_ERRORS = (httpx.HTTPError, ValueError, KeyError, TypeError)
# Renew the app token this long before Entra ID says it expires.
TOKEN_MARGIN_SECONDS = 300
FIRST_SYNC_DAYS = 30
MAX_TEXT_CHARS = 2000
# Claim extraction budget for channel sync, shared by the whole workspace.
SYNC_AI_CALLS_PER_HOUR = 60

_TENANT = re.compile(r"^[A-Za-z0-9.-]{1,100}$")
# Team ids are GUIDs; channel ids look like 19:abc…@thread.tacv2.
_RESOURCE_ID = re.compile(r"^[A-Za-z0-9:@._-]{1,200}$")
_BLOCK_TAGS = frozenset(
    {"p", "div", "br", "li", "ul", "ol", "tr", "table", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"}
)
_SKIP_TAGS = frozenset({"script", "style", "attachment"})


def check_tenant(value: str) -> str:
    if not isinstance(value, str) or not _TENANT.fullmatch(value):
        raise ValueError("Invalid tenant id")
    return value


def _check_resource_id(value: object) -> str:
    if not isinstance(value, str) or not _RESOURCE_ID.fullmatch(value):
        raise ValueError("Invalid Graph id")
    return value


@dataclass(frozen=True)
class ChannelRef:
    team_id: str
    channel_id: str

    @property
    def path(self) -> str:
        return f"/teams/{quote(self.team_id, safe='')}/channels/{quote(self.channel_id, safe='')}"


def parse_sync_channels(raw: str) -> tuple[ChannelRef, ...]:
    """`teamId/channelId,…` → channel references; raises ValueError on anything malformed."""
    channels: list[ChannelRef] = []
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        team, sep, channel = entry.partition("/")
        if not sep:
            raise ValueError("Expected teamId/channelId")
        ref = ChannelRef(_check_resource_id(team.strip()), _check_resource_id(channel.strip()))
        if ref not in channels:
            channels.append(ref)
    return tuple(channels)


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIP_TAGS:
            self._skip += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP_TAGS:
            self._skip = max(0, self._skip - 1)
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.parts.append(data)


def html_to_text(html: str) -> str:
    """Plain text of a Teams message body: tags dropped, entities decoded, whitespace tidied per line."""
    parser = _TextExtractor()
    parser.feed(html)
    parser.close()
    lines = (" ".join(line.split()) for line in "".join(parser.parts).splitlines())
    return "\n".join(line for line in lines if line)


def _parse_time(value: object) -> datetime:
    if not isinstance(value, str):
        raise TypeError("Missing timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _graph_datetime(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


@dataclass(frozen=True)
class ChannelMessage:
    id: str
    channel: ChannelRef
    author_id: str | None  # Entra ID object id of the user who posted, None for apps and bots
    author_name: str
    text: str
    created_at: datetime
    web_url: str | None


@dataclass(frozen=True)
class SyncedMessage:
    """A channel message ready for capture: author address resolved, channel named."""

    message: ChannelMessage
    author_addresses: tuple[str, ...]  # lowercased UPN and mail, if the author is a user
    team_name: str
    channel_name: str


def _message(channel: ChannelRef, raw: dict) -> ChannelMessage | None:
    """A user-authored, not-deleted chat message, or None for system events, deletions and empty bodies."""
    if raw.get("messageType") != "message" or raw.get("deletedDateTime"):
        return None
    sender = raw.get("from") or {}
    user = sender.get("user") if isinstance(sender, dict) else None
    if not isinstance(user, dict):
        return None
    body = raw.get("body") or {}
    content = body.get("content") if isinstance(body, dict) else None
    if not isinstance(content, str):
        return None
    text = html_to_text(content) if body.get("contentType") == "html" else content.strip()
    if not text:
        return None
    web_url = raw.get("webUrl")
    return ChannelMessage(
        id=_check_resource_id(raw["id"]),
        channel=channel,
        author_id=_check_resource_id(user["id"]) if user.get("id") else None,
        author_name=str(user.get("displayName") or "a Teams user"),
        text=text[:MAX_TEXT_CHARS],
        created_at=_parse_time(raw.get("createdDateTime")),
        web_url=web_url if isinstance(web_url, str) and web_url.startswith("https://") else None,
    )


class GraphApi(Protocol):
    def channel_messages(
        self, channel: ChannelRef, delta_link: str | None, since: datetime
    ) -> tuple[list[ChannelMessage], str | None]: ...

    def user_addresses(self, user_id: str) -> tuple[str, ...]: ...

    def channel_names(self, channel: ChannelRef) -> tuple[str, str]: ...


class HttpGraphApi:
    def __init__(
        self,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        *,
        timeout: float = 20.0,
        transport: httpx.BaseTransport | None = None,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._tenant = check_tenant(tenant_id)
        self._client_id = client_id
        self._client_secret = client_secret
        self._http = httpx.Client(timeout=timeout, transport=transport, follow_redirects=False)
        self._monotonic = monotonic
        self._token: str | None = None
        self._token_expires = 0.0
        self._lock = threading.Lock()

    def close(self) -> None:
        self._http.close()

    def _access_token(self, *, renew: bool = False) -> str:
        with self._lock:
            if renew or self._token is None or self._monotonic() >= self._token_expires:
                response = self._http.post(
                    f"{LOGIN}/{self._tenant}/oauth2/v2.0/token",
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self._client_id,
                        "client_secret": self._client_secret,
                        "scope": SCOPE,
                    },
                )
                response.raise_for_status()
                payload = response.json()
                token = payload["access_token"]
                if not isinstance(token, str) or not token:
                    raise ValueError("Missing access token")
                lifetime = int(payload.get("expires_in", 3599))
                self._token = token
                self._token_expires = self._monotonic() + max(0, lifetime - TOKEN_MARGIN_SECONDS)
            return self._token

    def _get(self, url: str, params: dict[str, str] | None = None) -> dict:
        # Only ever send the token to Graph itself, also when following server-provided links.
        if not url.startswith(GRAPH + "/"):
            raise ValueError("Refusing a non-Graph URL")
        token = self._access_token()
        for attempt in range(2):
            response = self._http.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
            if response.status_code == 401 and attempt == 0:
                token = self._access_token(renew=True)
                continue
            break
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise TypeError("Unexpected Graph response")
        return payload

    def channel_messages(
        self, channel: ChannelRef, delta_link: str | None, since: datetime
    ) -> tuple[list[ChannelMessage], str | None]:
        """One delta round: every page up to the new deltaLink (or the old one if Graph returned none)."""
        if delta_link:
            url, params = delta_link, None
        else:
            url = f"{GRAPH}{channel.path}/messages/delta"
            params = {"$filter": f"lastModifiedDateTime gt {_graph_datetime(since)}"}
        messages: list[ChannelMessage] = []
        while True:
            payload = self._get(url, params)
            values = payload.get("value", [])
            if not isinstance(values, list):
                raise TypeError("Unexpected delta page")
            for raw in values:
                if isinstance(raw, dict) and (message := _message(channel, raw)) is not None:
                    messages.append(message)
            next_link = payload.get("@odata.nextLink")
            if isinstance(next_link, str) and next_link:
                url, params = next_link, None
                continue
            new_delta = payload.get("@odata.deltaLink")
            return messages, new_delta if isinstance(new_delta, str) and new_delta else delta_link

    def user_addresses(self, user_id: str) -> tuple[str, ...]:
        payload = self._get(
            f"{GRAPH}/users/{quote(_check_resource_id(user_id), safe='')}",
            {"$select": "userPrincipalName,mail"},
        )
        found = (payload.get("userPrincipalName"), payload.get("mail"))
        return tuple(dict.fromkeys(v.strip().lower() for v in found if isinstance(v, str) and v.strip()))

    def channel_names(self, channel: ChannelRef) -> tuple[str, str]:
        team = self._get(f"{GRAPH}/teams/{quote(channel.team_id, safe='')}", {"$select": "displayName"})
        chan = self._get(f"{GRAPH}{channel.path}", {"$select": "displayName"})
        return str(team["displayName"]), str(chan["displayName"])


class ChannelSyncPoller:
    """Polls each channel's delta query and hands every new user message to `on_message` exactly once."""

    SEEN_MAX = 20000

    def __init__(
        self,
        api: GraphApi,
        channels: Iterable[ChannelRef],
        on_message: Callable[[SyncedMessage], str | None],
        interval: float = 60.0,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._api = api
        self.channels = tuple(channels)
        self._on_message = on_message
        self._interval = interval
        self._now = now
        self._delta: dict[ChannelRef, str | None] = {c: None for c in self.channels}
        self._names: dict[ChannelRef, tuple[str, str]] = {}
        self._addresses: dict[str, tuple[str, ...]] = {}
        self._seen: set[str] = set()
        self._order: deque[str] = deque()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.last_poll_at: datetime | None = None
        self.last_error: str | None = None
        self.messages_seen = 0
        self.items_created = 0

    def _mark_seen(self, key: str) -> None:
        self._seen.add(key)
        self._order.append(key)
        while len(self._order) > self.SEEN_MAX:
            self._seen.discard(self._order.popleft())

    def _channel_names(self, channel: ChannelRef) -> tuple[str, str]:
        if channel not in self._names:
            try:
                self._names[channel] = self._api.channel_names(channel)
            except GRAPH_ERRORS as exc:
                # Without Team/Channel.ReadBasic.All the ids label the source; retried on the next poll.
                log.warning("Teams channel name lookup failed: %s", type(exc).__name__)
                return channel.team_id, channel.channel_id
        return self._names[channel]

    def _author_addresses(self, user_id: str | None) -> tuple[str, ...]:
        if user_id is None:
            return ()
        if user_id not in self._addresses:
            try:
                self._addresses[user_id] = self._api.user_addresses(user_id)
            except GRAPH_ERRORS as exc:
                log.warning("Teams author lookup failed: %s", type(exc).__name__)
                return ()
        return self._addresses[user_id]

    def poll_once(self) -> int:
        created = 0
        error: str | None = None
        since = self._now() - timedelta(days=FIRST_SYNC_DAYS)
        for channel in self.channels:
            try:
                messages, self._delta[channel] = self._api.channel_messages(channel, self._delta[channel], since)
            except GRAPH_ERRORS as exc:
                error = type(exc).__name__
                log.warning("Teams channel sync failed: %s", error)
                if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (400, 404, 410):
                    self._delta[channel] = None  # expired or invalid delta token: start a fresh round
                continue
            team_name, channel_name = self._channel_names(channel) if messages else ("", "")
            for message in messages:
                key = f"{channel.team_id}/{channel.channel_id}/{message.id}"
                if key in self._seen:
                    continue
                self._mark_seen(key)
                self.messages_seen += 1
                synced = SyncedMessage(message, self._author_addresses(message.author_id), team_name, channel_name)
                try:
                    if self._on_message(synced):
                        created += 1
                        self.items_created += 1
                except Exception as exc:  # one bad message must not stop the rest
                    error = type(exc).__name__
                    log.warning("Teams message capture failed: %s", error)
        self.last_error = error
        self.last_poll_at = self._now()
        return created

    def _run(self) -> None:
        while not self._stop.is_set():
            self.poll_once()
            self._stop.wait(self._interval)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="teams-channel-sync", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout)
            self._thread = None
