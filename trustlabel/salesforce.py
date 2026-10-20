"""Salesforce Service Cloud connector: OAuth client credentials, new-case polling, internal case comments."""

from __future__ import annotations

import logging
import re
import threading
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol
from urllib.parse import urlsplit

import httpx

log = logging.getLogger(__name__)

API_VERSION = "v62.0"
COMMENT_MAX = 4000
SALESFORCE_ERRORS = (httpx.HTTPError, ValueError, KeyError, TypeError)

_DOMAIN = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?"
    r"(?:\.(?:develop|sandbox|scratch|trailblaze|demo|patch|free))?\.my\.salesforce\.com$"
)
_ID = re.compile(r"^[A-Za-z0-9]{15,18}$")


def check_domain(domain: str) -> str:
    """Return the lowercased My Domain host, or raise ValueError for anything else."""
    host = (domain or "").strip().lower()
    if not _DOMAIN.fullmatch(host):
        raise ValueError("Not a Salesforce My Domain host")
    return host


def _check_instance_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.username or parts.password or parts.port or parts.path.strip("/"):
        raise ValueError("Unexpected Salesforce instance URL")
    return "https://" + check_domain(parts.hostname or "")


def _check_id(value: str) -> str:
    if not isinstance(value, str) or not _ID.fullmatch(value):
        raise ValueError("Invalid Salesforce id")
    return value


def _parse_created(value: str) -> datetime:
    parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%f%z")
    return parsed.astimezone(UTC)


def _soql_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("Watermark must be timezone-aware")
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _opt_str(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


@dataclass(frozen=True)
class SalesforceCase:
    id: str
    number: str
    subject: str
    description: str
    account_name: str | None
    origin: str | None
    supplied_email: str | None
    created_at: datetime


class SalesforceApi(Protocol):
    def new_cases(self, since: datetime) -> list[SalesforceCase]: ...

    def add_case_comment(self, case_id: str, body: str) -> str: ...


class HttpSalesforceApi:
    def __init__(
        self,
        domain: str,
        client_id: str,
        client_secret: str,
        *,
        timeout: float = 15.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._domain = check_domain(domain)
        self._client_id = client_id
        self._client_secret = client_secret
        self._http = httpx.Client(timeout=timeout, transport=transport, follow_redirects=False)
        self._token: str | None = None
        self._instance: str | None = None
        self._user_id = ""  # the Run As user of the client credentials flow, i.e. who TrustLabel posts as
        self._lock = threading.Lock()

    def close(self) -> None:
        self._http.close()

    def _authenticate(self) -> None:
        response = self._http.post(
            f"https://{self._domain}/services/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self._client_id,
                "client_secret": self._client_secret,
            },
        )
        response.raise_for_status()
        payload = response.json()
        token = payload["access_token"]
        if not isinstance(token, str) or not token:
            raise ValueError("Missing access token")
        self._instance = _check_instance_url(payload["instance_url"])
        # Identity URL: https://login.salesforce.com/id/<org id>/<user id>
        self._user_id = _check_id(str(payload["id"]).rstrip("/").rsplit("/", 1)[-1])
        self._token = token

    def _user(self) -> str:
        with self._lock:
            if self._token is None:
                self._authenticate()
            return self._user_id

    def _request(self, method: str, path: str, **kwargs: object) -> httpx.Response:
        with self._lock:
            if self._token is None:
                self._authenticate()
            for attempt in range(2):
                response = self._http.request(
                    method,
                    f"{self._instance}/services/data/{API_VERSION}{path}",
                    headers={"Authorization": f"Bearer {self._token}"},
                    **kwargs,  # type: ignore[arg-type]
                )
                if response.status_code == 401 and attempt == 0:
                    self._token = None
                    self._authenticate()
                    continue
                break
            response.raise_for_status()
            return response

    def new_cases(self, since: datetime) -> list[SalesforceCase]:
        soql = (
            "SELECT Id, CaseNumber, Subject, Description, Origin, SuppliedEmail, CreatedDate, Account.Name "
            f"FROM Case WHERE CreatedDate > {_soql_datetime(since)} "
            # Salesforce remembers what TrustLabel already commented on, so a restart never briefs a case twice.
            f"AND Id NOT IN (SELECT ParentId FROM CaseComment WHERE CreatedById = '{self._user()}') "
            "ORDER BY CreatedDate ASC LIMIT 50"
        )
        records = self._request("GET", "/query", params={"q": soql}).json()["records"]
        if not isinstance(records, list):
            raise TypeError("Unexpected query result")
        cases = []
        for record in records:
            account = record.get("Account")
            cases.append(
                SalesforceCase(
                    id=_check_id(record["Id"]),
                    number=str(record["CaseNumber"]),
                    subject=_opt_str(record.get("Subject")) or "",
                    description=_opt_str(record.get("Description")) or "",
                    account_name=_opt_str(account.get("Name")) if isinstance(account, dict) else None,
                    origin=_opt_str(record.get("Origin")),
                    supplied_email=_opt_str(record.get("SuppliedEmail")),
                    created_at=_parse_created(record["CreatedDate"]),
                )
            )
        return cases

    def add_case_comment(self, case_id: str, body: str) -> str:
        payload = {"ParentId": _check_id(case_id), "CommentBody": body[:COMMENT_MAX], "IsPublished": False}
        return _check_id(self._request("POST", "/sobjects/CaseComment", json=payload).json()["id"])


class CasePoller:
    SEEN_MAX = 5000

    def __init__(
        self,
        api: SalesforceApi,
        on_case: Callable[[SalesforceCase], str | None],
        interval: float = 15.0,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._api = api
        self._on_case = on_case
        self._interval = interval
        self._watermark = now() - timedelta(minutes=2)
        self._seen: set[str] = set()
        self._order: deque[str] = deque()
        self._now = now
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.last_poll_at: datetime | None = None
        self.last_error: str | None = None
        self.cases_briefed = 0

    def _mark_seen(self, case_id: str) -> None:
        self._seen.add(case_id)
        self._order.append(case_id)
        while len(self._order) > self.SEEN_MAX:
            self._seen.discard(self._order.popleft())

    def poll_once(self) -> int:
        posted = 0
        error: str | None = None
        try:
            cases = self._api.new_cases(self._watermark)
        except SALESFORCE_ERRORS as exc:
            cases = []
            error = type(exc).__name__
            log.warning("Salesforce poll failed: %s", error)
        for case in cases:
            if case.id in self._seen:
                continue
            try:
                text = self._on_case(case)
                if text:
                    self._api.add_case_comment(case.id, text)
                    posted += 1
                    self.cases_briefed += 1
            except Exception as exc:  # one bad case must not stop the rest
                error = type(exc).__name__
                log.warning("Salesforce case %s failed: %s", case.number, error)
            self._mark_seen(case.id)
            if case.created_at > self._watermark:
                self._watermark = case.created_at
        self.last_error = error
        self.last_poll_at = self._now()
        return posted

    def _run(self) -> None:
        while not self._stop.is_set():
            self.poll_once()
            self._stop.wait(self._interval)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="salesforce-poller", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout)
            self._thread = None
