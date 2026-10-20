"""FastAPI app: per-user auth, trust-labelled answers, expert verification workflow, security middleware."""

from __future__ import annotations

import json
import logging
import re
import secrets
import threading
import time
from collections import deque
from collections.abc import AsyncIterator, Callable, Hashable
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.sessions import SessionMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .ai import (
    AI_SERVICE_ERRORS,
    ElevenLabsTranscriber,
    Extractor,
    OpenAIExtractor,
    Transcriber,
    ValidClaim,
    validate_extracted,
)
from .brief import brief_text, detect_client, plain_text, reply_for, unscoped_case_text
from .claude import ClaudeClient, DraftCandidate, template_question
from .config import REPO_ROOT, Settings
from .credentials import PasswordCheckBusy, load_credentials, verify_password_async
from .engine import (
    COUNTRY_NAMES,
    GRADES,
    KIND_LABELS,
    Answer,
    Context,
    ExpertMatch,
    SourceResult,
    assess,
    make_verified_item,
    match_topic,
    rank_experts,
    validate_value,
    value_display,
    visible_items,
)
from .google_auth import (
    CALLBACK_PATH,
    CANCELLED,
    FAILED,
    FLOW_COOKIE,
    FLOW_COOKIE_PATH,
    FLOW_MAX_AGE_SECONDS,
    UNLINKED,
    GoogleAuthError,
    TokenExchange,
    authorization_url,
    check_accounts,
    check_state,
    decode_id_token,
    google_enabled,
    http_token_exchange,
    load_flow,
    new_flow,
    sign_flow,
    verified_email,
)
from .guard import known_names, restricted, restricted_summary, restricted_view
from .mcp import (
    INVALID_REQUEST,
    MAX_MCP_BODY_BYTES,
    MCP_CALLS_PER_WINDOW,
    MCP_PATH,
    MCP_WINDOW_SECONDS,
    PARSE_ERROR,
    SUPPORTED_PROTOCOL_VERSIONS,
    UNAUTHORIZED,
    AskArgs,
    CaptureArgs,
    ConnectionTokens,
    RpcError,
    ask_summary,
    bearer_token,
    connection_view,
    handle_request,
    no_topic_text,
    parse_envelope,
    rpc_error,
    tool_error,
    tool_result,
    verification_summary,
)
from .meetings import (
    CALL_SOURCE,
    IN_FLIGHT,
    MAX_MEETING_BODY_BYTES,
    MAX_MEETING_BYTES,
    MAX_MEETING_TEXT_CHARS,
    MAX_MEETINGS_IN_FLIGHT,
    MEETING_SOURCE,
    MEETINGS_PATH,
    FolderWatcher,
    Meeting,
    MeetingLog,
    MeetingsBusy,
    NoSpeech,
    RecordingKind,
    ScribeMeetingTranscriber,
    media_type,
    meeting_name,
)
from .models import (
    AskBody,
    BriefBody,
    Candidate,
    CaptureBody,
    CaptureKind,
    ChannelCaptureBody,
    ChannelVerificationBody,
    Claim,
    Client,
    Item,
    LoginBody,
    Person,
    Resolution,
    ResolveBody,
    SpottConnectBody,
    Topic,
    Verification,
    VerificationCreateBody,
)
from .outlook import ASSET_PREFIX as OUTLOOK_ASSET_PREFIX
from .outlook import OUTLOOK_CSP, manifest_xml
from .salesforce import CasePoller, HttpSalesforceApi, SalesforceApi, SalesforceCase, SalesforceSource, SourcePoller
from .spott import (
    MAX_WEBHOOK_BYTES,
    NOTE_TITLE_MARKER,
    SPOTT_ERRORS,
    WEBHOOK_PATH,
    HttpSpottApi,
    SeenIds,
    SpottApi,
    SpottNote,
    WebhookError,
    evidence_text,
    note_html,
    parse_note_event,
    question_text,
    verify_signature,
    webhook_key,
)
from .store import Store, StoreCapacityError
from .teams_alerts import (
    ANSWER_VALID_DAYS,
    MAX_NOTE_CHARS,
    MAX_OUTGOING_BODY_BYTES,
    OUTGOING_PATH,
    TEAMS_ERRORS,
    HttpTeamsAlerts,
    TeamsAlerts,
    message_text,
    outgoing_key,
    outgoing_reply,
    parse_reply,
    request_card,
    request_code,
    resolved_card,
    split_answer,
    verify_outgoing,
    workflow_payload,
)
from .teams_graph import (
    NAME_PERMISSIONS,
    PERMISSIONS,
    SYNC_AI_CALLS_PER_HOUR,
    ChannelSyncPoller,
    GraphApi,
    HttpGraphApi,
    SyncedMessage,
)
from .voice import TTS_ERRORS, ElevenLabsSpeaker, SpeakBody, Speaker, speech_for

STATIC_DIR = REPO_ROOT / "static"
MAX_BODY_BYTES = 3_000_000
SESSION_COOKIE = "trustlabel_session"
SESSION_MAX_AGE_SECONDS = 8 * 3600
# Server-side sessions kept at once; the oldest are dropped first.
MAX_SESSIONS = 10_000
LOGIN_MAX_FAILURES = 5
AUTH_MAX_FAILURES_PER_IP = 30  # OAuth and bearer-token authentication use independent windows.
LOGIN_WINDOW_SECONDS = 300
LOGIN_ADMISSION_WINDOW_SECONDS = 1
LOGIN_MAX_CHECKS_PER_WINDOW = 30
# Spott and Teams webhook calls per client IP and minute.
WEBHOOK_CALLS_PER_MINUTE = 120
# All MCP messages (initialize, ping, tools/list, tools/call) per user and MCP_WINDOW_SECONDS.
MCP_MESSAGES_PER_WINDOW = 600
MAX_OPEN_REQUESTS_PER_USER = 10
MAX_VALIDITY_DAYS = 730
MAX_AUDIO_BYTES = 2_000_000
MAX_TRANSCRIPT_CHARS = 5_000
AI_CALLS_PER_HOUR = 20
AI_FAILED = "Speech or AI service failed; try again or answer manually"
# Title and source line of a captured item, per kind; a channel may pass its own (e.g. the email subject). The source
# line says the text was pasted in by a user: it must never read like a message a connector fetched from Teams.
CAPTURE_TITLES: dict[str, str] = {
    "teams_message": "{name} (captured)",
    "email": "Email captured by {name}",
    "meeting_summary": "Meeting summary captured by {name}",
    "phone_call": "Call notes captured by {name}",
    "note": "{name} (captured)",
}
CAPTURE_SOURCES: dict[str, str] = {
    "teams_message": "Teams message · pasted into TrustLabel, unverified",
    "email": "Email · pasted into TrustLabel, unverified",
    "meeting_summary": "Teams meeting summary · pasted into TrustLabel, unverified",
    "phone_call": "Phone call notes · pasted into TrustLabel, unverified",
    "note": "Note · pasted into TrustLabel, unverified",
}
# An email added as a source from Outlook: the first characters are enough for the claims that matter.
EMAIL_CAPTURE_CHARS = 4_000
# Spoken questions and read-aloud answers in the Chat view, per user and hour.
VOICE_ASKS_PER_HOUR = 60
SPEAK_CALLS_PER_HOUR = 120
# Reasons that make a source knowledge debt for its owner (shown on the trust board).
ATTENTION_CODES = frozenset(
    {"orphaned", "superseded", "contradicted_by_verification", "review_overdue", "review_due_soon", "chat_age"}
)
# Claim extraction budget for Spott notes, shared by the whole workspace.
SPOTT_AI_CALLS_PER_HOUR = 60
# Claim extraction budget for closed Salesforce cases and logged calls, shared by the whole workspace.
SALESFORCE_AI_CALLS_PER_HOUR = 60
# Sources shown with a channel brief (Outlook pane, Salesforce case comment).
BRIEF_SOURCES = 3
OUTLOOK_MANIFEST_PATH = "/outlook/manifest.xml"
TALKDESK_TEXT = (
    "Talkdesk already logs calls in Salesforce and connects to Microsoft Teams, so TrustLabel reaches calls "
    "through both: cases logged from a call get the same internal brief, call logs (Tasks of subtype Call) "
    "become graded sources, and agents can ask TrustLabel in Teams during the call. There is no direct "
    "Talkdesk connection."
)
logger = logging.getLogger("trustlabel")
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
        "media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    ),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "microphone=(self), camera=()",
}


class SlidingWindow:
    """Thread-safe per-key event log over a rolling time window (login failures, AI budget)."""

    MAX_KEYS = 10_000

    def __init__(self, window_seconds: float, clock: Callable[[], float] = time.monotonic) -> None:
        self._window = window_seconds
        self._clock = clock
        self._events: dict[Hashable, deque[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: Hashable, now: float) -> deque[float]:
        events = self._events.setdefault(key, deque())
        while events and now - events[0] >= self._window:
            events.popleft()
        return events

    def _prune(self, now: float) -> None:
        if len(self._events) > self.MAX_KEYS:
            for stale in [k for k, ev in self._events.items() if not ev or now - ev[-1] >= self._window]:
                del self._events[stale]
            # Still over the cap (a flood of distinct live keys): forget the oldest-inserted keys.
            while len(self._events) > self.MAX_KEYS:
                del self._events[next(iter(self._events))]

    def try_add(self, key: Hashable, limit: int) -> bool:
        """Record an event unless `limit` events already happened inside the window."""
        with self._lock:
            now = self._clock()
            events = self._recent(key, now)
            if len(events) >= limit:
                return False
            events.append(now)
            self._prune(now)
            return True

    def count(self, key: Hashable) -> int:
        with self._lock:
            return len(self._recent(key, self._clock())) if key in self._events else 0

    def clear(self, key: Hashable) -> None:
        with self._lock:
            self._events.pop(key, None)

    def release(self, key: Hashable) -> None:
        """Forget the newest event for `key` (an attempt that turned out to succeed)."""
        with self._lock:
            events = self._events.get(key)
            if events:
                events.pop()


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_api = scope["path"].startswith("/api/")
        # Outlook on the web frames the add-in task pane, and the pane loads Office.js from Microsoft.
        is_outlook = scope["path"].startswith(OUTLOOK_ASSET_PREFIX)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    headers[name] = value
                if is_outlook:
                    headers["Content-Security-Policy"] = OUTLOOK_CSP
                    del headers["X-Frame-Options"]
                if is_api:
                    headers["Cache-Control"] = "no-store"
            await send(message)

        await self.app(scope, receive, send_with_headers)


class RequestGuardMiddleware:
    """Rejects oversized bodies and cross-origin state-changing requests before any handler runs."""

    def __init__(self, app: ASGIApp, max_body: int, body_limits: dict[tuple[str, str], int] | None = None) -> None:
        self.app = app
        self.max_body = max_body
        # (method, path) → larger limit for the few endpoints that take big uploads.
        self.body_limits = body_limits or {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        declared = headers.get("content-length")
        max_body = self.body_limits.get((scope["method"], scope["path"]), self.max_body)
        if declared is not None and (not declared.isdigit() or int(declared) > max_body):
            await JSONResponse({"detail": "Request too large"}, status_code=413)(scope, receive, send)
            return
        if scope["method"] in UNSAFE_METHODS:
            origin = headers.get("origin")
            if origin is not None:
                cross_site = urlsplit(origin).netloc != headers.get("host", "")
            else:
                # Browsers that omit Origin still send Sec-Fetch-Site; server-to-server callers (webhooks,
                # MCP, the Outlook and Salesforce channels) send neither and authenticate with a key or HMAC.
                fetch_site = headers.get("sec-fetch-site")
                cross_site = fetch_site is not None and fetch_site not in ("same-origin", "none")
            if cross_site:
                await JSONResponse({"detail": "Cross-origin request blocked"}, status_code=403)(
                    scope, receive, send
                )
                return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > max_body:
                    raise HTTPException(413, "Request too large")
            return message

        await self.app(scope, limited_receive, send)


@dataclass(frozen=True)
class SpottLink:
    """The connected Spott workspace; replaced as a whole, so a request never sees half of a change."""

    api: SpottApi | None = None
    key: bytes | None = None  # webhook signing key
    source: str | None = None  # "environment" | "app"
    users: int | None = None


async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Never echo submitted input (e.g. passwords) back in error bodies.
    errors = [
        {"loc": list(err.get("loc", ())), "msg": err.get("msg", ""), "type": err.get("type", "")}
        for err in exc.errors()
    ]
    return JSONResponse({"detail": errors}, status_code=422)


def user_view(person: Person) -> dict:
    return {
        "id": person.id,
        "name": person.name,
        "title": person.title,
        "role": person.role,
        "country": person.country,
    }


def topic_view(topic: Topic) -> dict:
    return {"id": topic.id, "label": topic.label}


def context_view(ctx: Context) -> dict:
    return {
        "key": ctx.client_id or "general",
        "label": ctx.label,
        "country": ctx.country,
        "client_id": ctx.client_id,
    }


def answer_view(answer: Answer) -> dict:
    expert = answer.verified_by
    return {
        "status": answer.status,
        "action": answer.action,
        "headline": answer.headline,
        "detail": answer.detail,
        "value": answer.value,
        "value_display": answer.value_display,
        "grade": answer.grade,
        "competing": [
            {
                "value": c.value,
                "value_display": c.value_display,
                "best_grade": c.best_grade,
                "item_ids": list(c.item_ids),
            }
            for c in answer.competing
        ],
        "verified_by": {"id": expert.id, "name": expert.name, "title": expert.title} if expert else None,
    }


def expert_view(match: ExpertMatch) -> dict:
    person = match.person
    return {
        "id": person.id,
        "name": person.name,
        "title": person.title,
        "country": person.country,
        "score": match.score,
        "reasons": list(match.reasons),
    }


def create_app(
    settings: Settings,
    extractor: Extractor | None = None,
    transcriber: Transcriber | None = None,
    *,
    clock: Callable[[], date] = date.today,
    google_exchange: TokenExchange | None = None,
    spott: SpottApi | None = None,
    spott_factory: Callable[[str], SpottApi] = HttpSpottApi,
    salesforce: SalesforceApi | None = None,
    teams_alerts: TeamsAlerts | None = None,
    speaker: Speaker | None = None,
    claude: ClaudeClient | None = None,
    graph: GraphApi | None = None,
    meeting_transcriber: Transcriber | None = None,
    monotonic: Callable[[], float] = time.monotonic,
) -> FastAPI:
    store = Store(settings.data_dir)
    people_names = known_names(store.people)  # for the restricted-data guard; people are static seed data
    unknown_admins = settings.admins.difference(store.people)
    if unknown_admins:
        raise ValueError(f"TRUSTLABEL_ADMINS: unknown user(s) {', '.join(sorted(unknown_admins))}")
    unknown_teams = set(settings.teams_users).difference(store.people)
    if unknown_teams:
        raise ValueError(f"TRUSTLABEL_TEAMS_USERS: unknown user(s) {', '.join(sorted(unknown_teams))}")
    unknown_teams_ids = set(settings.teams_ids).difference(store.people)
    if unknown_teams_ids:
        raise ValueError(f"TRUSTLABEL_TEAMS_IDS: unknown user(s) {', '.join(sorted(unknown_teams_ids))}")
    if settings.meetings_owner is not None and settings.meetings_owner not in store.people:
        raise ValueError(f"TRUSTLABEL_MEETINGS_OWNER: unknown user {settings.meetings_owner}")
    if settings.meetings_dir is not None and settings.meetings_owner is None:
        raise ValueError("TRUSTLABEL_MEETINGS_DIR needs TRUSTLABEL_MEETINGS_OWNER")
    credentials = load_credentials(settings.credentials_file)
    sessions: dict[str, tuple[str, float]] = {}  # sid → (user id, issued at on `monotonic`), oldest first
    # Known accounts cannot lose their failure history to a flood of arbitrary usernames.
    login_attempts = SlidingWindow(LOGIN_WINDOW_SECONDS, monotonic)  # per account, independent of IP
    login_attempts.MAX_KEYS = len(store.people)  # fixed account set: no live account budget is evicted
    unknown_login_attempts = SlidingWindow(LOGIN_WINDOW_SECONDS, monotonic)
    login_admission = SlidingWindow(LOGIN_ADMISSION_WINDOW_SECONDS, monotonic)
    ip_failures = SlidingWindow(LOGIN_WINDOW_SECONDS, monotonic)  # MCP/channel token authentication only
    oauth_attempts = SlidingWindow(LOGIN_WINDOW_SECONDS, monotonic)
    webhook_calls = SlidingWindow(60)  # per ("spott" | "teams", IP)
    ai_budget = SlidingWindow(3600)
    if extractor is None and settings.openai_api_key:
        extractor = OpenAIExtractor(settings.openai_api_key, settings.openai_model)
    if transcriber is None and settings.elevenlabs_api_key:
        transcriber = ElevenLabsTranscriber(settings.elevenlabs_api_key, settings.elevenlabs_stt_model)
    if speaker is None and settings.elevenlabs_api_key:
        speaker = ElevenLabsSpeaker(settings.elevenlabs_api_key, settings.elevenlabs_voice_id)
    voice_budget = SlidingWindow(3600)  # per (user, "ask" | "speak")
    if spott is None and settings.spott_api_key:
        spott = HttpSpottApi(settings.spott_api_key)
    # Spott workspace from the environment; an admin can replace or disconnect it on the Integrations page.
    spott_link = SpottLink(
        api=spott,
        key=webhook_key(settings.spott_webhook_secret) if settings.spott_webhook_secret else None,
        source="environment" if spott is not None else None,
    )
    spott_last_delivery: datetime | None = None
    spott_budget = SlidingWindow(3600)
    spott_seen = SeenIds()
    spott_captures: dict[str, datetime] = {}  # captured item id → when its note arrived
    spott_written: set[str] = set()  # ids of the notes TrustLabel wrote to Spott itself
    spott_client_ids: dict[str, str] = {}  # TrustLabel client id → Spott client id
    clients_by_name = {c.name.strip().casefold(): c for c in store.clients.values()}

    def spott_client_for(spott_id: str, spott_name: str) -> Client | None:
        """TrustLabel client for a Spott client link, or None.

        A known Spott id wins; a name binds only a client not yet bound to another Spott id.
        """
        with store.lock:
            for client_id, bound in spott_client_ids.items():
                if bound == spott_id:
                    return store.clients[client_id]
            client = clients_by_name.get(spott_name.strip().casefold())
            # A same-named record with another id is someone else's (or a lookalike): never rebind write-back to it.
            if client is None or spott_client_ids.get(client.id, spott_id) != spott_id:
                return None
            spott_client_ids[client.id] = spott_id
            return client

    if salesforce is None and settings.salesforce_domain and settings.salesforce_client_id:
        salesforce = HttpSalesforceApi(
            settings.salesforce_domain, settings.salesforce_client_id, settings.salesforce_client_secret or ""
        )
    # `brief_case` is defined with the other channel handlers below; the poller only calls it after startup.
    case_poller = CasePoller(salesforce, lambda case: brief_case(case)) if salesforce is not None else None
    # Closed cases and logged calls become sources; needs claim extraction. `sync_salesforce_source` is below.
    source_poller = (
        SourcePoller(salesforce, lambda source: sync_salesforce_source(source))
        if salesforce is not None and extractor is not None
        else None
    )
    salesforce_budget = SlidingWindow(3600)
    if teams_alerts is None and settings.teams_workflow_url:
        teams_alerts = HttpTeamsAlerts(settings.teams_workflow_url)
    # Alerts leave the request thread: a slow Teams workflow never delays creating the request.
    alert_pool = None if teams_alerts is None else ThreadPoolExecutor(max_workers=2, thread_name_prefix="teams-alert")
    if claude is None and settings.anthropic_api_key:
        claude = ClaudeClient(settings.anthropic_api_key, settings.anthropic_model)
    if graph is None and settings.ms_tenant_id and settings.ms_client_id:
        graph = HttpGraphApi(settings.ms_tenant_id, settings.ms_client_id, settings.ms_client_secret or "")
    # Channel sync needs claim extraction; `sync_teams_message` is defined with the channel handlers below.
    teams_sync = (
        ChannelSyncPoller(graph, settings.teams_sync_channels, lambda message: sync_teams_message(message))
        if graph is not None and settings.teams_sync_channels and extractor is not None
        else None
    )
    teams_sync_budget = SlidingWindow(3600)
    if meeting_transcriber is None and settings.elevenlabs_api_key:
        meeting_transcriber = ScribeMeetingTranscriber(settings.elevenlabs_api_key, settings.elevenlabs_stt_model)
    meetings_on = meeting_transcriber is not None and extractor is not None
    meetings = MeetingLog()
    # One recording at a time: Scribe calls are long and the folder watcher must never block on them.
    meeting_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="meetings") if meetings_on else None
    # `ingest_meeting_file` is defined with the meeting handlers below; the watcher only calls it after startup.
    meeting_watcher = (
        FolderWatcher(settings.meetings_dir, lambda path, mtime, kind: ingest_meeting_file(path, mtime, kind))
        if settings.meetings_dir is not None and meetings_on
        else None
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if case_poller is not None:
            case_poller.start()
        if source_poller is not None:
            source_poller.start()
        if teams_sync is not None:
            teams_sync.start()
        if meeting_watcher is not None:
            meeting_watcher.start()
        try:
            yield
        finally:
            if case_poller is not None:
                await run_in_threadpool(case_poller.stop)
            if source_poller is not None:
                await run_in_threadpool(source_poller.stop)
            if teams_sync is not None:
                await run_in_threadpool(teams_sync.stop)
            if meeting_watcher is not None:
                await run_in_threadpool(meeting_watcher.stop)
            if meeting_pool is not None:
                meeting_pool.shutdown(wait=False, cancel_futures=True)
            if isinstance(salesforce, HttpSalesforceApi):
                salesforce.close()
            if isinstance(graph, HttpGraphApi):
                graph.close()
            if alert_pool is not None:
                alert_pool.shutdown(wait=False)
            if isinstance(teams_alerts, HttpTeamsAlerts):
                teams_alerts.close()
            if claude is not None:
                claude.close()

    app = FastAPI(title="TrustLabel", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.store = store
    app.state.sessions = sessions
    app.state.case_poller = case_poller
    app.state.source_poller = source_poller
    app.state.teams_sync = teams_sync
    app.state.alert_pool = alert_pool
    app.state.meetings = meetings
    app.state.meeting_watcher = meeting_watcher
    app.state.meeting_pool = meeting_pool
    app.add_exception_handler(RequestValidationError, _validation_error)

    @app.exception_handler(StoreCapacityError)
    async def storage_full(_: Request, exc: StoreCapacityError) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=429)

    # Added innermost first: headers wrap the guard, the guard wraps the session layer.
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.secret_key,
        session_cookie=SESSION_COOKIE,
        max_age=SESSION_MAX_AGE_SECONDS,
        same_site="strict",
        https_only=settings.cookie_secure,
    )
    app.add_middleware(
        RequestGuardMiddleware,
        max_body=MAX_BODY_BYTES,
        body_limits={
            ("POST", MEETINGS_PATH): MAX_MEETING_BODY_BYTES,
            # Webhooks are capped before their signatures are checked.
            ("POST", WEBHOOK_PATH): MAX_WEBHOOK_BYTES,
            ("POST", OUTGOING_PATH): MAX_OUTGOING_BODY_BYTES,
        },
    )
    app.add_middleware(SecurityHeadersMiddleware)

    sessions_lock = threading.Lock()

    def issue_session(request: Request, person: Person) -> None:
        """Replace the caller's session with a fresh one; expired and excess sessions are dropped."""
        previous = request.session.get("sid")
        sid = secrets.token_urlsafe(24)
        now = monotonic()
        with sessions_lock:
            if isinstance(previous, str):
                sessions.pop(previous, None)
            # Insertion order is issue order, so expired sessions sit at the front.
            while sessions and now - next(iter(sessions.values()))[1] >= SESSION_MAX_AGE_SECONDS:
                sessions.pop(next(iter(sessions)))
            while len(sessions) >= MAX_SESSIONS:
                sessions.pop(next(iter(sessions)))
            sessions[sid] = (person.id, now)
        request.session.clear()
        request.session["sid"] = sid

    def current_user(request: Request) -> Person:
        sid = request.session.get("sid")
        user_id = None
        if isinstance(sid, str):
            with sessions_lock:
                entry = sessions.get(sid)
                if entry is not None and monotonic() - entry[1] >= SESSION_MAX_AGE_SECONDS:
                    sessions.pop(sid, None)
                    entry = None
            user_id = entry[0] if entry is not None else None
        person = store.people.get(user_id) if user_id else None
        if person is None or not person.active:
            raise HTTPException(401, "Not authenticated")
        return person

    def context_label(country: str, client_id: str | None) -> str:
        if client_id:
            client = store.clients[client_id]
            return f"{client.name} ({client.country})"
        return f"{COUNTRY_NAMES.get(country, country)} — all clients"

    def resolve_context(user: Person, client_id: str | None) -> Context:
        if client_id is None:
            return Context(user.country, None, context_label(user.country, None), clock())
        if client_id not in user.client_ids or client_id not in store.clients:
            raise HTTPException(403, "Client is not in your portfolio")
        client = store.clients[client_id]
        return Context(client.country, client_id, context_label(client.country, client_id), clock())

    def find_open_request(user: Person, topic_id: str, ctx: Context) -> Verification | None:
        return next(
            (
                v
                for v in store.verifications.values()
                if v.status == "open"
                and (v.requester_id == user.id or user.id in v.follower_ids)
                and (v.topic_id, v.country, v.client_id) == (topic_id, ctx.country, ctx.client_id)
            ),
            None,
        )

    def source_view(result: SourceResult, topic: Topic) -> dict:
        item = result.item
        owner = store.people.get(item.owner_id) if item.owner_id else None
        author = store.people.get(item.author_id) if item.author_id else None
        return {
            "id": item.id,
            "kind": item.kind,
            "kind_label": KIND_LABELS[item.kind],
            "title": item.title,
            "source": item.source,
            "provenance": item.provenance,
            "author_name": author.name if author else None,
            "owner_name": owner.name if owner and owner.active else None,
            "owner_active": bool(owner and owner.active),
            "created_on": item.created_on.isoformat(),
            "last_reviewed_on": item.last_reviewed_on.isoformat() if item.last_reviewed_on else None,
            "statement": result.claim.statement,
            "quote": result.claim.quote,
            "body": item.body,
            "value": result.claim.value,
            "value_display": value_display(topic, result.claim.value),
            "valid_until": result.claim.valid_until.isoformat() if result.claim.valid_until else None,
            "status": result.status,
            "applicability": {"code": result.applicability_code, "text": result.applicability_text},
            "score": result.score,
            "grade": result.grade,
            "reasons": [
                {"code": r.code, "text": r.text, "delta": r.delta, "cap": r.cap} for r in result.reasons
            ],
        }

    def verification_view(v: Verification, user: Person) -> dict:
        return {
            "id": v.id,
            "topic": topic_view(store.topics_by_id[v.topic_id]),
            "context_label": context_label(v.country, v.client_id),
            "question": v.question,
            "asked": v.asked,
            "requester_name": store.people[v.requester_id].name,
            "assignee_name": store.people[v.assignee_id].name,
            "is_assignee": v.assignee_id == user.id,
            "status": v.status,
            "created_at": v.created_at.isoformat(timespec="seconds"),
            "candidates": [c.model_dump() for c in v.candidates],
            # Draft voice statements stay with the expert until they confirm a value.
            "voice_transcript": v.voice_transcript if v.assignee_id == user.id or v.status == "resolved" else None,
            "resolution": v.resolution.model_dump(mode="json") if v.resolution else None,
        }

    def visible_to(user: Person) -> list[Item]:
        """Every item `user` may see (provenance, client and country scoped); call with the store lock held."""
        return visible_items(store.items(), user, store.clients)

    def service_desk_items(client: Client) -> list[Item]:
        """What a shared channel (Salesforce case, Spott note) may use for `client`: shared knowledge for its country
        plus the client's own, never anyone's private submissions. Call with the store lock held."""
        return [
            i
            for i in store.items()
            if i.provenance != "submitted"
            and (
                client.id in i.client_ids
                if i.client_ids
                else i.provenance == "knowledge_base" or client.country in i.countries
            )
        ]

    def build_ask_result(user: Person, topic: Topic, ctx: Context, matched: list[str]) -> dict:
        with store.lock:
            assessment = assess(topic, ctx, visible_to(user), store.people, store.clients)
            experts = rank_experts(topic, ctx, assessment, store.people, store.clients, user.id)
            pending = find_open_request(user, topic.id, ctx)
            return {
                "topic": topic_view(topic),
                "matched_keywords": matched,
                "context": context_view(ctx),
                "answer": answer_view(assessment.answer),
                "sources": [source_view(s, topic) for s in assessment.sources],
                "experts": [expert_view(m) for m in experts],
                "open_request": (
                    {"id": pending.id, "assignee_name": store.people[pending.assignee_id].name}
                    if pending
                    else None
                ),
            }

    @app.post("/api/login")
    async def login(body: LoginBody, request: Request) -> dict:
        username = body.username.strip().lower()
        person = store.people.get(username)
        attempts = login_attempts if person is not None else unknown_login_attempts
        # Rotating forwarded IPs cannot reset an account's failure budget.
        if attempts.count(username) >= LOGIN_MAX_FAILURES:
            raise HTTPException(429, "Too many failed attempts. Try again in 5 minutes.")
        # Limit total expensive work, but never impose a five-minute lock on unrelated NAT users.
        # Admission and scrypt saturation reject before entering the synchronous worker pool.
        if not login_admission.try_add("password", LOGIN_MAX_CHECKS_PER_WINDOW):
            raise HTTPException(429, "Too many sign-in attempts; try again shortly")
        # The reservation, not the early count above, enforces the limit under concurrency.
        if not attempts.try_add(username, LOGIN_MAX_FAILURES):
            raise HTTPException(429, "Too many failed attempts. Try again in 5 minutes.")
        encoded = credentials.get(username) if person is not None and person.active else None
        try:
            valid = await verify_password_async(body.password, encoded)
        except PasswordCheckBusy:
            attempts.release(username)
            raise HTTPException(429, "Too many sign-in attempts; try again shortly") from None
        if not valid or person is None:
            raise HTTPException(401, "Invalid username or password")
        attempts.clear(username)
        issue_session(request, person)
        return {"user": user_view(person)}

    @app.post("/api/logout", status_code=204)
    def logout(request: Request) -> Response:
        sid = request.session.get("sid")
        if isinstance(sid, str):
            with sessions_lock:
                sessions.pop(sid, None)
        request.session.clear()
        return Response(status_code=204)

    @app.get("/api/me")
    def me(user: Person = Depends(current_user)) -> dict:
        contexts = [context_view(resolve_context(user, client_id)) for client_id in user.client_ids]
        contexts.append(context_view(resolve_context(user, None)))
        return {
            "user": user_view(user),
            "contexts": contexts,
            "topics": [topic_view(t) for t in store.topics],
            "features": {
                "voice": extractor is not None and transcriber is not None,
                "capture": extractor is not None,
                "voice_ask": transcriber is not None,
                "speak": speaker is not None,
            },
        }

    @app.get("/api/overview")
    def overview(client_id: str | None = None, user: Person = Depends(current_user)) -> dict:
        """Trust board for one context: each topic's answer, source health, knowledge debt, activity."""
        ctx = resolve_context(user, client_id)
        results = [build_ask_result(user, topic, ctx, []) for topic in store.topics]
        in_scope: dict[str, dict] = {}
        for result in results:
            for s in result["sources"]:
                if s["status"] != "not_applicable":
                    in_scope.setdefault(s["id"], s)
        current = [s for s in in_scope.values() if s["status"] == "effective"]
        attention = []
        for s in in_scope.values():
            issues = [r["text"] for r in s["reasons"] if r["code"] in ATTENTION_CODES]
            if issues:
                attention.append(
                    {
                        "id": s["id"],
                        "title": s["title"],
                        "kind_label": s["kind_label"],
                        "grade": s["grade"],
                        "score": s["score"],
                        "owner_name": s["owner_name"],
                        "issues": issues,
                    }
                )
        attention.sort(key=lambda a: (a["score"], a["id"]))
        topics = [
            {
                "topic": r["topic"],
                "answer": r["answer"],
                "source_count": sum(1 for s in r["sources"] if s["status"] != "not_applicable"),
                "current_count": sum(1 for s in r["sources"] if s["status"] == "effective"),
                "top_expert": r["experts"][0] if r["experts"] else None,
                "open_request": r["open_request"],
            }
            for r in results
        ]
        grades = dict.fromkeys(GRADES, 0)
        for s in current:
            grades[s["grade"]] += 1

        with store.lock:
            visible_ids = {i.id for i in visible_to(user)}
            mine = [v for v in store.verifications.values() if user.id in (v.requester_id, v.assignee_id)]
            events: list[tuple[datetime, str, str]] = []
            announced: set[str] = set()
            for v in store.verifications.values():
                label = f"{store.topics_by_id[v.topic_id].label} — {context_label(v.country, v.client_id)}"
                res = v.resolution
                # Verified answers are shared knowledge, but only where the verified item is visible.
                if res and res.item_id in visible_ids and res.item_id not in announced:
                    announced.add(res.item_id)
                    expert = store.people[v.assignee_id].name
                    events.append((res.resolved_at, "verified", f"{expert} verified {label}: {res.value_display}"))
                if v.requester_id == user.id:
                    events.append(
                        (v.created_at, "requested", f"You asked {store.people[v.assignee_id].name} to verify {label}")
                    )
                elif v.assignee_id == user.id:
                    events.append(
                        (v.created_at, "assigned", f"{store.people[v.requester_id].name} asked you to verify {label}")
                    )
            items_by_id = {i.id: i for i in store.items()}
            for item_id, at in spott_captures.items():
                item = items_by_id.get(item_id)
                if item is not None and item_id in visible_ids:
                    client = store.clients[item.client_ids[0]].name
                    events.append((at, "captured", f"From a Spott note on {client}: {item.claims[0].statement}"))
            requests = {
                "awaiting_you": sum(1 for v in mine if v.status == "open" and v.assignee_id == user.id),
                "sent_open": sum(1 for v in mine if v.status == "open" and v.requester_id == user.id),
                "resolved": sum(1 for v in mine if v.status == "resolved"),
            }
        events.sort(key=lambda e: e[0], reverse=True)
        return {
            "context": context_view(ctx),
            "topics": topics,
            "health": {
                "topics": len(topics),
                "safe_topics": sum(1 for t in topics if t["answer"]["action"] == "use"),
                "in_scope": len(in_scope),
                "current": len(current),
                "verified": sum(1 for s in current if s["kind"] == "verified_answer"),
                "grades": grades,
                "attention": len(attention),
            },
            "attention": attention,
            "requests": requests,
            "activity": [
                {"kind": kind, "text": text, "at": at.isoformat(timespec="seconds")} for at, kind, text in events[:8]
            ],
        }

    def restricted_for(question: str) -> dict | None:
        """Refusal for questions about another person's pay or private data; None when the question is fine."""
        if restricted(question, people_names) is None:
            return None
        return {"topic": None, "restricted": restricted_view(store.people)}

    def ask_for(
        user: Person, question: str, client_id: str | None, topic_id: str | None = None, auto_ask: bool = False
    ) -> dict:
        """The one answer path for every surface (web, chat, voice): rules pick the topic, nothing is invented."""
        question = question.strip()
        if not question and not topic_id:
            raise HTTPException(422, "Type a question or pick a topic")
        if question and (refusal := restricted_for(question)) is not None:
            return refusal
        ctx = resolve_context(user, client_id)
        if topic_id is not None:
            topic = store.topics_by_id.get(topic_id)
            if topic is None:
                raise HTTPException(404, "Unknown topic")
            matched: list[str] = []
        else:
            topic, matched = match_topic(question, store.topics)
            if topic is None:
                return {"topic": None, "suggestions": [topic_view(t) for t in store.topics]}
        result = build_ask_result(user, topic, ctx, matched)
        result["auto_request"] = auto_request_for(user, topic, ctx, question, result) if auto_ask else None
        return result

    def auto_request_for(user: Person, topic: Topic, ctx: Context, question: str, result: dict) -> dict | None:
        """Ask the routed expert on the user's behalf when the answer is not safe to act on; never twice."""
        if result["answer"]["action"] != "ask_expert" or not result["experts"] or result["open_request"]:
            return None
        try:
            # `share`: if a colleague already asked for this context, follow their request instead of asking again.
            view, _ = create_verification_for(user, topic.id, ctx.client_id, question or topic.label, share=True)
        except HTTPException as exc:
            logger.info("Auto-ask skipped: %s", exc.detail)
            return None
        result["open_request"] = {"id": view["id"], "assignee_name": view["assignee_name"]}
        return view

    @app.post("/api/ask")
    def ask(body: AskBody, user: Person = Depends(current_user)) -> dict:
        return ask_for(user, body.question, body.client_id, body.topic_id, auto_ask=body.auto_ask)

    @app.post("/api/voice/ask")
    def voice_ask(
        audio: UploadFile = File(),
        client_id: str | None = Form(default=None, max_length=64),
        auto_ask: bool = Form(default=False),
        user: Person = Depends(current_user),
    ) -> dict:
        """Spoken question: ElevenLabs transcribes, then the same rules answer as for a typed question."""
        if transcriber is None:
            raise HTTPException(503, "Voice questions need ElevenLabs (set ELEVENLABS_API_KEY)")
        content_type = (audio.content_type or "").split(";", 1)[0].strip().lower()
        if not content_type.startswith("audio/"):
            raise HTTPException(415, "Upload an audio recording")
        data = audio.file.read(MAX_AUDIO_BYTES + 1)
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Audio too large (max 2 MB)")
        if not data:
            raise HTTPException(422, "No speech detected")
        client_id = client_id or None
        resolve_context(user, client_id)  # reject foreign contexts before spending a transcription
        if not voice_budget.try_add((user.id, "ask"), VOICE_ASKS_PER_HOUR):
            raise HTTPException(429, "Voice limit reached; try again later")
        filename = re.sub(r"[^A-Za-z0-9._-]", "", audio.filename or "")[:64] or "question.webm"
        try:
            transcript = transcriber.transcribe(data, filename, content_type).strip()
        except AI_SERVICE_ERRORS as exc:
            logger.warning("Transcription failed: %s", exc)
            raise HTTPException(502, "Speech service failed; try again or type the question") from None
        # Same length cap as a typed question (AskBody).
        transcript = transcript[:300]
        if not transcript:
            raise HTTPException(422, "No speech detected")
        result = ask_for(user, transcript, client_id, auto_ask=auto_ask)
        return {"transcript": transcript, "result": result, "speech": speech_for(result)}

    @app.post("/api/voice/speak")
    def voice_speak(body: SpeakBody, user: Person = Depends(current_user)) -> Response:
        """Read a short answer aloud (ElevenLabs text-to-speech); audio is never cached."""
        if speaker is None:
            raise HTTPException(503, "Spoken answers need ElevenLabs (set ELEVENLABS_API_KEY)")
        text = body.text.strip()
        if not text:
            raise HTTPException(422, "Nothing to say")
        if not voice_budget.try_add((user.id, "speak"), SPEAK_CALLS_PER_HOUR):
            raise HTTPException(429, "Voice limit reached; try again later")
        try:
            audio = speaker.synthesize(text)
        except TTS_ERRORS as exc:
            logger.warning("Text-to-speech failed: %s", type(exc).__name__)
            raise HTTPException(502, "Speech service failed; read the answer on screen") from None
        return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})

    @app.get("/api/verifications")
    def list_verifications(user: Person = Depends(current_user)) -> dict:
        with store.lock:
            mine = [
                v
                for v in store.verifications.values()
                if user.id in (v.requester_id, v.assignee_id) or user.id in v.follower_ids
            ]
            mine.sort(key=lambda v: (v.status != "open", -v.created_at.timestamp()))
            return {"items": [verification_view(v, user) for v in mine]}

    def alert_payload(v: Verification, requester: Person, match: ExpertMatch) -> dict:
        """Teams card for the routed expert, with the reasons TrustLabel picked them."""
        expert = match.person
        address = settings.teams_users.get(expert.id)
        claims: dict[str, str] = {}  # value → best grade (candidates arrive best first)
        for c in v.candidates:
            claims.setdefault(c.value_display, c.grade)
        card = request_card(
            expert_name=expert.name,
            expert_address=address,
            requester_name=requester.name,
            topic_label=store.topics_by_id[v.topic_id].label,
            context_label=context_label(v.country, v.client_id),
            question=v.question,
            candidates=list(claims.items()),
            reasons=match.reasons,
            open_url=f"{settings.public_url}/?view=inbox" if settings.public_url else None,
            reply_code=request_code(v.id) if settings.teams_outgoing_secret else None,
        )
        return workflow_payload(card, address)

    def send_alert(verification_id: str, payload: dict) -> None:
        try:
            teams_alerts.send(payload)
        except TEAMS_ERRORS as exc:
            logger.warning("Teams alert for %s failed: %s", verification_id, type(exc).__name__)
            return
        logger.info("Teams alert for %s sent", verification_id)

    def open_request_to_reuse(user: Person, topic_id: str, ctx: Context, share: bool) -> Verification | None:
        """The user's own open request, or with `share` anyone's for this context (the user then follows it)."""
        existing = find_open_request(user, topic_id, ctx)
        if existing is not None or not share:
            return existing
        key = (topic_id, ctx.country, ctx.client_id)
        shared = next(
            (
                v
                for v in store.verifications.values()
                if v.status == "open" and (v.topic_id, v.country, v.client_id) == key
            ),
            None,
        )
        if shared is not None and user.id != shared.assignee_id:
            shared.follower_ids.append(user.id)
        return shared

    def draft_question(ctx: Context, topic: Topic, candidates: list[Candidate]) -> str:
        drafts = [DraftCandidate(c.value_display, c.title, c.grade) for c in candidates]
        if claude is None:
            return template_question(ctx.label, topic.label, drafts)
        return claude.draft_question(ctx.label, topic.label, drafts)

    def create_verification_for(
        user: Person, topic_id: str, client_id: str | None, question: str, *, share: bool = False
    ) -> tuple[dict, bool]:
        """Route a question to the top expert; returns (verification view, created). Raises HTTPException.

        The expert receives a drafted question naming every competing value; the requester's wording is kept
        in `asked`. With `share`, another user's open request for the same context is reused instead.
        """
        topic = store.topics_by_id.get(topic_id)
        if topic is None:
            raise HTTPException(404, "Unknown topic")
        ctx = resolve_context(user, client_id)
        question = question.strip()
        if not question:
            raise HTTPException(422, "Question must not be empty")
        with store.lock:
            # Server recomputes everything; the client never chooses the verifier or the candidates.
            assessment = assess(topic, ctx, visible_to(user), store.people, store.clients)
            if assessment.answer.status == "verified":
                raise HTTPException(409, "Already verified for this context")
            existing = open_request_to_reuse(user, topic.id, ctx, share)
            if existing is not None:
                return verification_view(existing, user), False
            open_count = sum(
                1 for v in store.verifications.values() if v.requester_id == user.id and v.status == "open"
            )
            if open_count >= MAX_OPEN_REQUESTS_PER_USER:
                raise HTTPException(429, "Too many open verification requests")
            experts = rank_experts(topic, ctx, assessment, store.people, store.clients, user.id)
            if not experts:
                raise HTTPException(422, "No expert available for this topic and context")
            candidates = [
                Candidate(
                    value=s.claim.value,
                    value_display=value_display(topic, s.claim.value),
                    item_id=s.item.id,
                    title=s.item.title,
                    grade=s.grade,
                )
                for s in assessment.sources
                if s.status == "effective"
            ]
        # Drafting may call Claude (up to 15 s): never while holding the store lock.
        drafted = draft_question(ctx, topic, candidates)
        with store.lock:
            existing = open_request_to_reuse(user, topic.id, ctx, share)  # created meanwhile
            if existing is not None:
                return verification_view(existing, user), False
            verification = Verification(
                id="vr_" + secrets.token_urlsafe(9),
                topic_id=topic.id,
                country=ctx.country,
                client_id=ctx.client_id,
                question=drafted,
                asked=question,
                requester_id=user.id,
                assignee_id=experts[0].person.id,
                status="open",
                created_at=datetime.now().astimezone(),
                candidates=candidates,
            )
            try:
                store.add_verification(verification)
            except StoreCapacityError as exc:
                raise HTTPException(429, str(exc)) from None
            if alert_pool is not None:
                alert_pool.submit(send_alert, verification.id, alert_payload(verification, user, experts[0]))
            return verification_view(verification, user), True

    @app.post("/api/verifications", status_code=201)
    def create_verification(
        body: VerificationCreateBody, response: Response, user: Person = Depends(current_user)
    ) -> dict:
        view, created = create_verification_for(user, body.topic_id, body.client_id, body.question)
        if not created:
            response.status_code = 200
        return view

    def assigned_open_request(vid: str, user: Person) -> Verification:
        """Only the assignee may act; everyone else gets the same 404 as for a missing id."""
        verification = store.verifications.get(vid)
        if verification is None or verification.assignee_id != user.id:
            raise HTTPException(404, "Verification request not found")
        if verification.status != "open":
            raise HTTPException(409, "Already resolved")
        return verification

    def resolved_payload(v: Verification, expert: Person, topic: Topic, grade: str) -> dict:
        """One Teams card for everyone who asked or followed the resolved request, the expert excluded."""
        people: list[str] = []
        for person_id in (v.requester_id, *v.follower_ids):
            if person_id != expert.id and person_id not in people and person_id in store.people:
                people.append(person_id)
        resolution = v.resolution
        card, recipient = resolved_card(
            people=[(store.people[p].name, settings.teams_users.get(p)) for p in people],
            expert_name=expert.name,
            topic_label=topic.label,
            context_label=context_label(v.country, v.client_id),
            value_display=resolution.value_display,
            grade=grade,
            note=resolution.note,
            open_url=f"{settings.public_url}/?view=ask" if settings.public_url else None,
        )
        return workflow_payload(card, recipient)

    def resolve_request(
        vid: str, user: Person, raw_value: str, note: str, valid_until: date, background: BackgroundTasks
    ) -> tuple[Verification, str]:
        """The expert's answer becomes a verified answer (inbox and Teams alike); returns (request, grade).

        Raises HTTPException (429 when storage is full, before anything changed). Only the addressed request is
        resolved: other open requests for the same context, whoever they are assigned to, keep their own question and
        stay open for their assignee. Its asker and followers get one Teams card, and a Spott-linked client a note.
        """
        today = clock()
        with store.lock:
            verification = assigned_open_request(vid, user)
            topic = store.topics_by_id[verification.topic_id]
            try:
                value = validate_value(topic, raw_value)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from None
            if not today < valid_until <= today + timedelta(days=MAX_VALIDITY_DAYS):
                raise HTTPException(422, "Valid until must be after today and at most 2 years ahead")
            note = note.strip()
            # A voice statement is only evidence for the value it was recognised as stating.
            stated = verification
            if value != verification.voice_value:
                stated = verification.model_copy(update={"voice_transcript": None, "voice_value": None})
            ctx_label = context_label(verification.country, verification.client_id)
            item = make_verified_item(stated, value, note, valid_until, user, topic, ctx_label, today)
            try:
                store.add_item(item)
            except StoreCapacityError as exc:
                raise HTTPException(429, str(exc)) from None
            verification.voice_transcript, verification.voice_value = stated.voice_transcript, stated.voice_value
            resolution = Resolution(
                value=value,
                value_display=value_display(topic, value),
                note=note,
                valid_until=valid_until,
                resolved_at=datetime.now().astimezone().replace(microsecond=0),
                item_id=item.id,
            )
            verification.status = "resolved"
            verification.resolution = resolution
            ctx = Context(verification.country, verification.client_id, ctx_label, today)
            grade = assess(topic, ctx, [item], store.people, store.clients).source(item.id).grade
            if alert_pool is not None:
                alert_pool.submit(send_alert, verification.id, resolved_payload(verification, user, topic, grade))
            if spott_link.api is not None and verification.client_id:
                client = store.clients[verification.client_id]
                background.add_task(
                    post_verified_to_spott,
                    client.id,
                    f"{NOTE_TITLE_MARKER} Verified: {topic.label}",
                    [
                        f"{topic.label} for {client.name}: {resolution.value_display}",
                        (
                            f"Verified by {user.name} ({user.title}) on {today.isoformat()}, "
                            f"valid until {valid_until.isoformat()}."
                        ),
                        f"Note: {note}" if note else "",
                        f"TrustLabel verified answer {item.id}",
                    ],
                )
            return verification, grade

    @app.post("/api/verifications/{vid}/resolve")
    def resolve_verification(
        vid: str, body: ResolveBody, background: BackgroundTasks, user: Person = Depends(current_user)
    ) -> dict:
        verification, _ = resolve_request(vid, user, body.value, body.note, body.valid_until, background)
        with store.lock:
            return verification_view(verification, user)

    # --- Reply in Teams: a Teams Outgoing Webhook posts "@TrustLabel TL-7F2K 25 …" from a channel, HMAC-signed ---

    teams_outgoing_key = outgoing_key(settings.teams_outgoing_secret) if settings.teams_outgoing_secret else None
    teams_senders = {object_id: user_id for user_id, object_id in settings.teams_ids.items()}
    teams_usage = "To answer a verification request: @TrustLabel TL-XXXX <your answer>, e.g. @TrustLabel TL-7F2K 25"

    def answer_from_teams(object_id: str, text: str, background: BackgroundTasks) -> str:
        """Reply text for one outgoing-webhook message; a valid answer resolves exactly like the inbox."""
        person = store.people.get(teams_senders.get(object_id, ""))
        if person is None or not person.active:
            shown = object_id or "missing"
            return (
                f"TrustLabel doesn't know this Teams account yet (aadObjectId {shown}). Ask the TrustLabel admin to "
                f"add <your TrustLabel user id>={shown} to TRUSTLABEL_TEAMS_IDS."
            )
        parsed = parse_reply(text)
        if parsed is None:
            return teams_usage
        code, answer = parsed
        with store.lock:
            # Codes are 4 characters, so only the sender's own requests are candidates, open ones first.
            mine = [
                v for v in store.verifications.values() if v.assignee_id == person.id and request_code(v.id) == code
            ]
            verification = next((v for v in mine if v.status == "open"), mine[0] if mine else None)
            if verification is None:
                return f"{code} is not a verification request assigned to you."
            if verification.status != "open":
                return f"{code} was already answered."
            topic = store.topics_by_id[verification.topic_id]
        if not answer:
            return teams_usage
        try:
            raw_value, note = split_answer(topic, answer)
        except ValueError as exc:
            return f"{code}: {exc}. {teams_usage}"
        if len(note) > MAX_NOTE_CHARS:
            return f"{code}: the note is too long (max {MAX_NOTE_CHARS} characters)."
        valid_until = clock() + timedelta(days=ANSWER_VALID_DAYS)
        try:
            verification, grade = resolve_request(verification.id, person, raw_value, note, valid_until, background)
        except HTTPException as exc:
            return f"{code}: {exc.detail}"
        resolution = verification.resolution
        return (
            f"Verified: {topic.label} for {context_label(verification.country, verification.client_id)} is "
            f"{resolution.value_display} (grade {grade}), valid until {resolution.valid_until.isoformat()}. "
            "Everyone who asked sees it in TrustLabel now."
        )

    @app.post(OUTGOING_PATH, include_in_schema=False)
    async def teams_outgoing(request: Request, background: BackgroundTasks) -> JSONResponse:
        """Teams Outgoing Webhook: verify the HMAC over the raw body, then answer in the thread (within 5 s)."""
        if teams_outgoing_key is None:
            raise HTTPException(404, "Not found")
        ip = request.client.host if request.client else "unknown"
        if not webhook_calls.try_add(("teams", ip), WEBHOOK_CALLS_PER_MINUTE):
            raise HTTPException(429, "Too many requests")
        raw = bytearray()
        async for chunk in request.stream():
            raw += chunk
            if len(raw) > MAX_OUTGOING_BODY_BYTES:
                raise HTTPException(413, "Request too large")
        body = bytes(raw)
        if not verify_outgoing(teams_outgoing_key, request.headers.get("authorization"), body):
            raise HTTPException(401, "Invalid signature")
        try:
            activity = json.loads(body)
        except ValueError:
            raise HTTPException(400, "Invalid JSON") from None
        if not isinstance(activity, dict):
            raise HTTPException(400, "Invalid message")
        sender = activity.get("from")
        object_id = sender.get("aadObjectId") if isinstance(sender, dict) else None
        object_id = object_id.strip().lower()[:64] if isinstance(object_id, str) else ""
        raw_text = activity.get("text")
        raw_text = raw_text if isinstance(raw_text, str) else ""
        # message_text runs regexes over up to 64 KB: keep it off the event loop with the answer itself.
        reply = await run_in_threadpool(
            lambda: answer_from_teams(object_id, message_text(raw_text) if raw_text else "", background)
        )
        return JSONResponse(outgoing_reply(reply))

    @app.post("/api/verifications/{vid}/voice")
    def voice_answer(
        vid: str, audio: UploadFile = File(), user: Person = Depends(current_user)
    ) -> dict:
        """Expert answers by voice: ElevenLabs transcribes, OpenAI extracts, rules validate, expert confirms."""
        today = clock()
        with store.lock:
            topic = store.topics_by_id[assigned_open_request(vid, user).topic_id]
        if extractor is None or transcriber is None:
            raise HTTPException(503, "Voice verification is not configured")
        content_type = (audio.content_type or "").split(";", 1)[0].strip().lower()
        if not content_type.startswith("audio/"):
            raise HTTPException(415, "Upload an audio recording")
        data = audio.file.read(MAX_AUDIO_BYTES + 1)
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Audio too large (max 2 MB)")
        if not data:
            raise HTTPException(422, "No speech detected")
        if not ai_budget.try_add(user.id, AI_CALLS_PER_HOUR):
            raise HTTPException(429, "AI usage limit reached; try again later")
        filename = re.sub(r"[^A-Za-z0-9._-]", "", audio.filename or "")[:64] or "answer.webm"
        try:
            transcript = transcriber.transcribe(data, filename, content_type).strip()[:MAX_TRANSCRIPT_CHARS]
        except AI_SERVICE_ERRORS as exc:
            logger.warning("Transcription failed: %s", exc)
            raise HTTPException(502, AI_FAILED) from None
        if not transcript:
            raise HTTPException(422, "No speech detected")
        try:
            claims = extractor.extract(transcript, [topic], today)
        except AI_SERVICE_ERRORS as exc:
            logger.warning("Claim extraction failed: %s", exc)
            raise HTTPException(502, AI_FAILED) from None
        valid = validate_extracted(claims, transcript, {topic.id: topic}, today)
        suggestion = next((c for c in valid if c.topic.id == topic.id), None)
        with store.lock:
            request = assigned_open_request(vid, user)
            request.voice_transcript = transcript
            request.voice_value = suggestion.value if suggestion else None
        return {
            "transcript": transcript,
            "suggestion": (
                {
                    "value": suggestion.value,
                    "value_display": suggestion.value_display,
                    "valid_until": suggestion.valid_until.isoformat() if suggestion.valid_until else None,
                    "quote": suggestion.quote,
                }
                if suggestion
                else None
            ),
        }

    def claim_rows(item_id: str, valid: list[ValidClaim]) -> list[Claim]:
        """The first valid claim per topic, as stored on a captured item; each keeps its own stated expiry."""
        first: dict[str, ValidClaim] = {}
        for claim in valid:
            first.setdefault(claim.topic.id, claim)
        return [
            Claim(
                id=f"{item_id}-{n}",
                topic_id=claim.topic.id,
                value=claim.value,
                statement=f"{claim.topic.label}: {claim.value_display}",
                quote=claim.quote,
                valid_until=claim.valid_until,
            )
            for n, claim in enumerate(first.values(), start=1)
        ]

    def capture_for(
        user: Person,
        text: str,
        client_id: str | None,
        kind: CaptureKind = "teams_message",
        title: str | None = None,
        source: str | None = None,
    ) -> dict:
        """Turn pasted or forwarded text into graded claims; only verbatim-quoted claims survive.

        The caller's text proves nothing about where it came from, so the item is a quarantined submission: only the
        caller sees it (as an unverified preview) and it never feeds an answer until an expert verifies the value.
        """
        ctx = resolve_context(user, client_id)
        if extractor is None:
            raise HTTPException(503, "Capture is not configured")
        text = text.strip()
        if not text:
            raise HTTPException(422, "Paste the message text")
        if not ai_budget.try_add(user.id, AI_CALLS_PER_HOUR):
            raise HTTPException(429, "AI usage limit reached; try again later")
        try:
            extracted = extractor.extract(text, store.topics, ctx.today)
        except AI_SERVICE_ERRORS as exc:
            logger.warning("Claim extraction failed: %s", exc)
            raise HTTPException(502, AI_FAILED) from None
        item_id = "CAP-" + secrets.token_hex(4).upper()
        claims = claim_rows(item_id, validate_extracted(extracted, text, store.topics_by_id, ctx.today))
        if not claims:
            raise HTTPException(422, "No verifiable claim found in the text (quotes must appear verbatim)")
        item = Item(
            id=item_id,
            kind=kind,
            title=title or CAPTURE_TITLES[kind].format(name=user.name),
            source=source or CAPTURE_SOURCES[kind],
            author_id=user.id,
            owner_id=None,
            created_on=ctx.today,
            last_reviewed_on=None,
            review_cycle_days=None,
            countries=[ctx.country],
            # Scope comes from the capture context the user chose, never from the model.
            client_ids=[ctx.client_id] if ctx.client_id else [],
            effective_from=None,
            effective_to=None,
            supersedes=[],
            body=text,
            claims=claims,
            provenance="submitted",
        )
        store.add_item(item)
        first_topic = store.topics_by_id[claims[0].topic_id]
        return {"captured_item_id": item_id, "result": build_ask_result(user, first_topic, ctx, [])}

    @app.post("/api/capture", status_code=201)
    def capture(body: CaptureBody, user: Person = Depends(current_user)) -> dict:
        return capture_for(user, body.text, body.client_id, body.kind)

    # --- Recordings: meetings and phone calls (upload or watched folder) → diarized Scribe transcript → one item each

    def meeting_view(m: Meeting) -> dict:
        return {
            "id": m.id,
            "name": m.name,
            "origin": m.origin,
            "kind": m.kind,
            "meeting_on": m.meeting_on.isoformat(),
            "created_at": iso(m.created_at),
            "status": m.status,
            "claims": m.claims,
            "item_id": m.item_id,
            "error": m.error,
        }

    def meetings_folder_view() -> dict:
        owner = store.people.get(settings.meetings_owner) if settings.meetings_owner else None
        watcher = meeting_watcher
        return {
            "configured": watcher is not None,
            "owner_name": owner.name if owner and watcher else None,
            "last_scan_at": iso(watcher.last_scan_at) if watcher else None,
            "files_processed": watcher.files_processed if watcher else 0,
            "last_error": watcher.last_error if watcher else None,
        }

    def process_meeting(meeting_id: str, data: bytes, filename: str, content_type: str) -> None:
        """Transcribe, extract, keep verbatim claims; the job records the outcome, never the transcript."""
        if meeting_transcriber is None or extractor is None:
            return
        meeting = meetings.update(meeting_id, status="transcribing")
        owner = store.people[meeting.owner_id]
        try:
            text = meeting_transcriber.transcribe(data, filename, content_type).strip()[:MAX_MEETING_TEXT_CHARS]
            if not text:
                raise NoSpeech("empty transcript")
            today = clock()
            extracted = extractor.extract(text, store.topics, today)
            claims = claim_rows(meeting.id, validate_extracted(extracted, text, store.topics_by_id, today))
            if claims:
                store.add_item(
                    Item(
                        id=meeting.id,
                        kind=meeting.kind,
                        title=f"{'Call' if meeting.kind == 'phone_call' else 'Meeting'} · {meeting.name} · "
                        f"{meeting.meeting_on.isoformat()}",
                        source=CALL_SOURCE if meeting.kind == "phone_call" else MEETING_SOURCE,
                        author_id=owner.id,
                        owner_id=owner.id,
                        created_on=meeting.meeting_on,
                        last_reviewed_on=None,
                        review_cycle_days=None,
                        countries=[owner.country],
                        client_ids=[],
                        effective_from=None,
                        effective_to=None,
                        supersedes=[],
                        body=text,
                        claims=claims,
                        # An uploaded recording is the uploader's own submission; the configured folder is a connector.
                        provenance="submitted" if meeting.origin == "upload" else "connector",
                    )
                )
        except Exception as exc:  # kept on the job; one bad recording must not stop the queue
            meetings.update(meeting_id, status="failed", error=type(exc).__name__)
            logger.warning("Meeting %s (%s) failed: %s", meeting_id, meeting.name, type(exc).__name__)
            return
        meetings.update(meeting_id, status="done", claims=len(claims), item_id=meeting.id if claims else None)
        logger.info("Meeting %s (%s) transcribed: %d verbatim claim(s)", meeting_id, meeting.name, len(claims))

    def queue_meeting(
        name: str,
        owner_id: str,
        origin: Literal["upload", "folder"],
        meeting_on: date,
        data: bytes,
        filename: str,
        kind: RecordingKind,
    ) -> Meeting:
        if meeting_pool is None:
            raise HTTPException(503, "Meeting capture is not configured")
        content_type = media_type(filename, None) or "application/octet-stream"
        meeting = meetings.add(name, owner_id, origin, meeting_on, kind)
        meeting_pool.submit(process_meeting, meeting.id, data, filename, content_type)
        return meeting

    def ingest_meeting_file(path: Path, mtime: float, kind: RecordingKind) -> None:
        """Folder watcher: a stable new recording (a phone call inside `calls/`) owned by TRUSTLABEL_MEETINGS_OWNER."""
        if settings.meetings_owner is None:
            return
        if meetings.in_flight(settings.meetings_owner) >= MAX_MEETINGS_IN_FLIGHT:
            raise MeetingsBusy  # the watcher retries this file at its next scan
        with path.open("rb") as recording:
            data = recording.read(MAX_MEETING_BYTES + 1)
        if len(data) > MAX_MEETING_BYTES:
            raise ValueError("recording grew past the size limit")
        filename = re.sub(r"[^A-Za-z0-9._-]", "", path.name)[-100:] or "recording" + path.suffix.lower()
        meeting_on = min(date.fromtimestamp(mtime), clock())
        queue_meeting(meeting_name(path.name), settings.meetings_owner, "folder", meeting_on, data, filename, kind)

    @app.post(MEETINGS_PATH, status_code=202)
    def upload_meeting(
        recording: UploadFile = File(),
        kind: RecordingKind = Form("meeting"),
        user: Person = Depends(current_user),
    ) -> dict:
        """Upload a meeting or phone call recording (≤ 25 MB); transcription and extraction run in the background."""
        if meeting_pool is None:
            raise HTTPException(503, "Meeting capture is not configured")
        original = recording.filename or ""
        if media_type(original, recording.content_type) is None:
            raise HTTPException(415, "Upload an audio or video recording (mp3, m4a, wav, webm, ogg, mp4)")
        data = recording.file.read(MAX_MEETING_BYTES + 1)
        if len(data) > MAX_MEETING_BYTES:
            raise HTTPException(413, "Recording too large (max 25 MB)")
        if not data:
            raise HTTPException(422, "The recording is empty")
        if meetings.in_flight(user.id) >= MAX_MEETINGS_IN_FLIGHT:
            raise HTTPException(429, "Wait until your current recordings are processed")
        if not ai_budget.try_add(user.id, AI_CALLS_PER_HOUR):
            raise HTTPException(429, "AI usage limit reached; try again later")
        suffix = Path(original).suffix.lower()
        filename = re.sub(r"[^A-Za-z0-9._-]", "", original)[-100:] or "recording" + suffix
        meeting = queue_meeting(meeting_name(original), user.id, "upload", clock(), data, filename, kind)
        logger.info("Recording %s (%s) uploaded by %s (%d bytes)", meeting.id, kind, user.id, len(data))
        return meeting_view(meeting)

    @app.get(MEETINGS_PATH)
    def list_meetings(user: Person = Depends(current_user)) -> dict:
        items = [meeting_view(m) for m in meetings.for_owner(user.id)]
        return {
            "items": items,
            "in_flight": sum(1 for m in items if m["status"] in IN_FLIGHT),
            "folder": meetings_folder_view(),
        }

    # --- Teams channel sync: Microsoft Graph delta query in, verbatim claims kept as graded Teams sources ---

    teams_people = {address: user_id for user_id, address in settings.teams_users.items()}
    all_countries = sorted({c.country for c in store.clients.values()})

    def sync_teams_message(synced: SyncedMessage) -> str | None:
        """Keep the claims a channel message states verbatim; the author is mapped through TRUSTLABEL_TEAMS_USERS."""
        message = synced.message
        if extractor is None or not teams_sync_budget.try_add("teams", SYNC_AI_CALLS_PER_HOUR):
            logger.warning("Teams message skipped: AI budget reached")
            return None
        author = next(
            (store.people[teams_people[a]] for a in synced.author_addresses if a in teams_people), None
        )
        today = clock()
        try:
            extracted = extractor.extract(message.text, store.topics, today)
        except AI_SERVICE_ERRORS as exc:
            logger.warning("Claim extraction failed: %s", type(exc).__name__)
            return None
        item_id = "TEAMS-" + secrets.token_hex(4).upper()
        claims = claim_rows(item_id, validate_extracted(extracted, message.text, store.topics_by_id, today))
        if not claims:
            return None
        author_label = author.name if author else f"{message.author_name} (external)"
        item = Item(
            id=item_id,
            kind="teams_message",
            title=f"{author_label} in {synced.channel_name}",
            source=f"Teams · {synced.team_name}/{synced.channel_name}",
            author_id=author.id if author else None,
            owner_id=None,
            created_on=min(message.created_at.date(), today),
            last_reviewed_on=None,
            review_cycle_days=None,
            # A channel has no country of its own: a known author's country, otherwise every country we serve.
            countries=[author.country] if author else all_countries,
            client_ids=[],
            effective_from=None,
            effective_to=None,
            supersedes=[],
            body=evidence_text(message.text, [c.quote for c in claims]),
            claims=claims,
            provenance="connector",
        )
        store.add_item(item)
        logger.info("Teams channel message captured as %s", item_id)
        return item_id

    # --- Spott: signed note webhooks in, verified answers out as notes on the client's Spott record ---

    def ingest_spott_note(note_id: str) -> None:
        """Fetch a Spott note and keep the claims it states verbatim, scoped to the one client it is on."""
        api = spott_link.api
        if api is None or extractor is None or note_id in spott_written:
            return
        # The budget covers the paid note fetch too; each note takes one slot whatever it turns out to be.
        if not spott_budget.try_add("spott", SPOTT_AI_CALLS_PER_HOUR):
            logger.warning("Spott note %s skipped: AI budget reached", note_id)
            return
        try:
            note = api.get_note(note_id)
        except SPOTT_ERRORS as exc:
            logger.warning("Spott note fetch failed: %s", type(exc).__name__)
            return
        if note.title.startswith(NOTE_TITLE_MARKER) or not note.text:
            return
        question = question_text(note.text)
        if question is not None:
            spott_budget.release("spott")  # answer_spott_question takes the slot itself
            answer_spott_question(api, note, question)
            return
        # Scope comes from the note's client link in Spott, never from the model; ambiguous links are skipped.
        client = spott_client_for(*note.clients[0]) if len(note.clients) == 1 else None
        if client is None:
            logger.info("Spott note %s skipped: not linked to exactly one known client", note.id)
            return
        today = clock()
        try:
            extracted = extractor.extract(note.text, store.topics, today)
        except AI_SERVICE_ERRORS as exc:
            logger.warning("Claim extraction failed: %s", exc)
            return
        item_id = "SPOTT-" + secrets.token_hex(4).upper()
        claims = claim_rows(item_id, validate_extracted(extracted, note.text, store.topics_by_id, today))
        if not claims:
            logger.info("Spott note %s: no verifiable claim", note.id)
            return
        item = Item(
            id=item_id,
            kind="spott_note",
            title=note.title or f"Note on {client.name}",
            source=f"Spott · note by {note.author_name or 'a Spott user'} on {client.name}",
            author_id=None,
            owner_id=None,
            created_on=note.created_on,
            last_reviewed_on=None,
            review_cycle_days=None,
            countries=[client.country],
            client_ids=[client.id],
            effective_from=None,
            effective_to=None,
            supersedes=[],
            body=evidence_text(note.text, [c.quote for c in claims]),
            claims=claims,
            provenance="connector",
        )
        try:
            store.add_item(item)
        except ValueError as exc:
            logger.warning("Spott note %s rejected: %s", note.id, exc)
            return
        spott_captures[item_id] = datetime.now().astimezone().replace(microsecond=0)
        logger.info("Spott note %s captured as %s for %s", note.id, item_id, client.name)

    def answer_spott_question(api: SpottApi, note: SpottNote, question: str) -> None:
        """A note addressed to TrustLabel: reply with the labelled answer on the same Spott client; store nothing."""
        if not note.clients:
            return
        spott_id, spott_name = note.clients[0]
        if not spott_budget.try_add("spott", SPOTT_AI_CALLS_PER_HOUR):
            logger.warning("Spott question %s skipped: budget reached", note.id)
            return
        # Same scope rule as captured notes: exactly one Spott client, bound by id (or by name while unbound).
        client = spott_client_for(spott_id, spott_name) if len(note.clients) == 1 else None
        topic, _ = match_topic(plain_text(question), store.topics) if question else (None, [])
        if client is None:
            title = f"{NOTE_TITLE_MARKER} Client not linked"
            lines = [
                "TrustLabel: client not linked.",
                "Ask on the record of one client that TrustLabel knows; answers differ per client.",
            ]
        elif topic is None:
            title = f"{NOTE_TITLE_MARKER} No matching topic"
            lines = [
                "TrustLabel: no matching topic for this question.",
                "Name the subject, for example: " + "; ".join(t.label for t in store.topics[:5]) + ".",
            ]
        else:
            ctx = Context(client.country, client.id, context_label(client.country, client.id), clock())
            with store.lock:
                items = service_desk_items(client)
            title = f"{NOTE_TITLE_MARKER} Answer: {topic.label}"
            # Recruiters asked internally, so the labelled answer is enough; no client-facing reply template.
            lines = brief_text(brief_payload(topic, ctx, items, "", client, None) | {"reply": None}).split("\n")
        try:
            spott_written.add(api.add_client_note(spott_id, title, note_html(lines)))
        except SPOTT_ERRORS as exc:
            logger.warning("Spott answer write-back failed: %s", type(exc).__name__)
            return
        logger.info("Spott question %s answered: %s", note.id, topic.id if client and topic else "no answer")

    def post_verified_to_spott(client_id: str, title: str, lines: list[str]) -> None:
        """Put a verified answer on the client's Spott record, where recruiters already look."""
        api = spott_link.api
        if api is None:
            return
        name = store.clients[client_id].name
        try:
            spott_id = spott_client_ids.get(client_id) or api.find_client_id(name)
            if spott_id is None:
                logger.info("No Spott client named %s; verified answer not written back", name)
                return
            # A record bound in the meantime (note or connect) keeps the binding; a name lookup never replaces it.
            spott_id = spott_client_ids.setdefault(client_id, spott_id)
            spott_written.add(api.add_client_note(spott_id, title, note_html(lines)))
        except SPOTT_ERRORS as exc:
            logger.warning("Spott write-back failed: %s", type(exc).__name__)

    @app.post(WEBHOOK_PATH, include_in_schema=False)
    async def spott_webhook(request: Request, background: BackgroundTasks) -> JSONResponse:
        """Svix-signed Spott events: verify, deduplicate, acknowledge; the note is fetched in the background."""
        nonlocal spott_last_delivery
        link = spott_link
        if link.api is None or extractor is None or link.key is None:
            raise HTTPException(404, "Not found")
        ip = request.client.host if request.client else "unknown"
        if not webhook_calls.try_add(("spott", ip), WEBHOOK_CALLS_PER_MINUTE):
            raise HTTPException(429, "Too many requests")
        body = await request.body()
        if len(body) > MAX_WEBHOOK_BYTES:
            raise HTTPException(413, "Request too large")
        try:
            msg_id = verify_signature(link.key, request.headers, body)
        except WebhookError:
            raise HTTPException(401, "Invalid signature") from None
        spott_last_delivery = datetime.now().astimezone().replace(microsecond=0)
        try:
            event = parse_note_event(body)
        except WebhookError:
            raise HTTPException(400, "Malformed event") from None
        if not spott_seen.add(msg_id):
            return JSONResponse({"status": "duplicate"})
        if event is None or not event.client_ids:
            return JSONResponse({"status": "ignored"})
        background.add_task(ingest_spott_note, event.note_id)
        return JSONResponse({"status": "accepted"}, status_code=202)

    # --- Microsoft Teams / Copilot Studio: remote MCP server with per-user connection tokens ---
    connections = ConnectionTokens()
    app.state.connections = connections
    mcp_calls = SlidingWindow(MCP_WINDOW_SECONDS)

    @app.post("/api/connections/teams", status_code=201)
    def connect_teams(user: Person = Depends(current_user)) -> dict:
        token, record = connections.issue(user.id)  # plaintext leaves the server exactly once
        return {"token": token, "expires_at": record.expires_at.isoformat(timespec="seconds"), "mcp_path": MCP_PATH}

    @app.get("/api/connections")
    def list_connections(user: Person = Depends(current_user)) -> dict:
        return {"teams": connection_view(connections.status(user.id))}

    @app.delete("/api/connections/teams", status_code=204)
    def disconnect_teams(user: Person = Depends(current_user)) -> Response:
        connections.revoke(user.id)
        return Response(status_code=204)

    def resolve_client(user: Person, query: str | None) -> str | None:
        """Client id or unique name fragment, looked up only inside the user's own portfolio."""
        needle = (query or "").strip().casefold()
        if not needle:
            return None
        own = [store.clients[c] for c in user.client_ids if c in store.clients]
        exact = [c for c in own if needle in (c.id.casefold(), c.name.casefold())]
        matches = exact or [c for c in own if needle in c.name.casefold()]
        if len(matches) > 1:
            raise HTTPException(422, "Client name is ambiguous; use one of: " + ", ".join(c.id for c in matches))
        if not matches:
            raise HTTPException(403, "Client is not in your portfolio")
        return matches[0].id

    def mcp_tools() -> list[str]:
        tools = ["ask_trustlabel", "request_verification"]
        return tools + ["capture_source"] if extractor is not None else tools

    def call_mcp_tool(user: Person, name: str, args: AskArgs | CaptureArgs) -> dict:
        if not mcp_calls.try_add(user.id, MCP_CALLS_PER_WINDOW):
            return tool_error("Rate limit reached; try again later")
        try:
            client_id = resolve_client(user, args.client)
            if isinstance(args, CaptureArgs):
                captured = capture_for(user, args.text, client_id, args.kind)
                text = f"Captured as {captured['captured_item_id']}.\n" + ask_summary(captured["result"])
                return tool_result(text, captured)
            if (refusal := restricted_for(args.question)) is not None:
                return tool_result(restricted_summary(refusal["restricted"]), refusal)
            ctx = resolve_context(user, client_id)
            topic, matched = match_topic(args.question, store.topics)
            if topic is None:
                suggestions = [topic_view(t) for t in store.topics]
                if name == "request_verification":
                    return tool_error(no_topic_text(suggestions))
                return tool_result(no_topic_text(suggestions), {"topic": None, "suggestions": suggestions})
            if name == "request_verification":
                view, created = create_verification_for(user, topic.id, client_id, args.question)
                return tool_result(verification_summary(view, created), {"verification": view, "created": created})
            result = build_ask_result(user, topic, ctx, matched)
            return tool_result(ask_summary(result), result)
        except HTTPException as exc:
            return tool_error(str(exc.detail))
        except StoreCapacityError as exc:
            return tool_error(str(exc))

    def mcp_response(status: int, payload: dict | None = None, headers: dict | None = None) -> Response:
        headers = {"Cache-Control": "no-store", **(headers or {})}
        if payload is None:
            return Response(status_code=status, headers=headers)
        return JSONResponse(payload, status_code=status, headers=headers)

    @app.post(MCP_PATH, include_in_schema=False)
    async def mcp_endpoint(request: Request) -> Response:
        """Streamable HTTP transport, stateless, JSON responses only. Token auth only, never cookies."""
        ip = request.client.host if request.client else "unknown"
        # Failed token checks count per IP (released again on success), so tokens cannot be guessed at speed.
        if not ip_failures.try_add(("auth", ip), AUTH_MAX_FAILURES_PER_IP):
            return mcp_response(429, rpc_error(None, INVALID_REQUEST, "Too many failed attempts; try again later"))
        user_id = connections.authenticate(bearer_token(request.headers))
        user = store.people.get(user_id) if user_id else None
        if user is None or not user.active:
            return mcp_response(
                401,
                rpc_error(None, UNAUTHORIZED, "Unauthorized"),
                {"WWW-Authenticate": 'Bearer realm="trustlabel"'},
            )
        ip_failures.release(("auth", ip))
        if not mcp_calls.try_add(("mcp-messages", user.id), MCP_MESSAGES_PER_WINDOW):
            return mcp_response(429, rpc_error(None, INVALID_REQUEST, "Rate limit reached; try again later"))
        version = request.headers.get("mcp-protocol-version")
        if version is not None and version not in SUPPORTED_PROTOCOL_VERSIONS:
            return mcp_response(400, rpc_error(None, INVALID_REQUEST, "Unsupported MCP-Protocol-Version"))
        declared = request.headers.get("content-length")
        too_large = mcp_response(413, rpc_error(None, INVALID_REQUEST, "Request too large"))
        if declared is not None and declared.isdigit() and int(declared) > MAX_MCP_BODY_BYTES:
            return too_large
        raw = bytearray()
        async for chunk in request.stream():
            raw += chunk
            if len(raw) > MAX_MCP_BODY_BYTES:
                return too_large
        try:
            message = json.loads(raw)
        except (ValueError, RecursionError):
            return mcp_response(400, rpc_error(None, PARSE_ERROR, "Parse error"))
        try:
            envelope = parse_envelope(message)
        except RpcError as exc:
            return mcp_response(400, rpc_error(None, exc.code, exc.message))
        if not envelope.expects_response:
            return mcp_response(202)
        reply = await run_in_threadpool(
            handle_request,
            envelope,
            tools=mcp_tools(),
            call_tool=lambda name, args: call_mcp_tool(user, name, args),
        )
        return mcp_response(200, reply)

    @app.api_route(MCP_PATH, methods=["GET", "DELETE"], include_in_schema=False)
    def mcp_method_not_allowed() -> Response:
        return mcp_response(405, headers={"Allow": "POST"})

    # --- Channel layer: one brief core for Outlook (add-in, personal key) and Salesforce (case comments) ---

    def portfolio(user: Person) -> list[Client]:
        return [store.clients[c] for c in user.client_ids if c in store.clients]

    def brief_payload(
        topic: Topic, ctx: Context, items: list[Item], requester_id: str, client: Client | None, signature: str | None
    ) -> dict:
        """Labelled answer, strongest current sources, best verifier and a reply template for one context."""
        with store.lock:
            assessment = assess(topic, ctx, items, store.people, store.clients)
            experts = rank_experts(topic, ctx, assessment, store.people, store.clients, requester_id)
        answer = assessment.answer
        top = experts[0] if experts else None
        current = [s for s in assessment.sources if s.status == "effective"][:BRIEF_SOURCES]
        return {
            "topic": topic_view(topic),
            "context_label": ctx.label,
            "answer": {
                "action": answer.action,
                "status": answer.status,
                "headline": answer.headline,
                "detail": answer.detail,
                "value_display": answer.value_display,
                "grade": answer.grade,
            },
            "sources": [
                {
                    "id": s.item.id,
                    "title": s.item.title,
                    "kind_label": KIND_LABELS[s.item.kind],
                    "grade": s.grade,
                    "value_display": value_display(topic, s.claim.value),
                    "status": s.status,
                    "source": s.item.source,
                }
                for s in current
            ],
            "expert": (
                {"id": top.person.id, "name": top.person.name, "title": top.person.title, "reasons": list(top.reasons)}
                if top
                else None
            ),
            "reply": reply_for(answer.action, topic, answer.value_display, client.name if client else None, signature),
        }

    def channel_user(request: Request) -> Person:
        """Personal connection key (X-API-Key or Bearer) only; channel calls never use the session cookie."""
        ip = request.client.host if request.client else "unknown"
        if not ip_failures.try_add(("auth", ip), AUTH_MAX_FAILURES_PER_IP):
            raise HTTPException(429, "Too many failed attempts; try again later")
        user_id = connections.authenticate(bearer_token(request.headers))
        user = store.people.get(user_id) if user_id else None
        if user is None or not user.active:
            raise HTTPException(401, "Unauthorized", headers={"WWW-Authenticate": 'Bearer realm="trustlabel"'})
        ip_failures.release(("auth", ip))
        if not mcp_calls.try_add(("channel", user.id), MCP_CALLS_PER_WINDOW):
            raise HTTPException(429, "Rate limit reached; try again later")
        return user

    @app.get("/api/v1/me")
    def channel_me(user: Person = Depends(channel_user)) -> dict:
        clients = [{"id": c.id, "name": c.name, "country": c.country} for c in portfolio(user)]
        return {"id": user.id, "name": user.name, "title": user.title, "clients": clients}

    @app.post("/api/v1/brief")
    def channel_brief(body: BriefBody, user: Person = Depends(channel_user)) -> dict:
        """Brief for one email. Rules pick the client and topic; the email is not stored and no AI is called."""
        own = portfolio(user)
        text = plain_text(body.subject, body.body)
        if body.client_id is not None:
            ctx = resolve_context(user, body.client_id)  # 403 outside the user's portfolio
            client, matched_by = store.clients[body.client_id], "chosen"
        else:
            client, matched_by = detect_client(text, body.sender, own)
            ctx = resolve_context(user, client.id if client else None)
        topic, _ = match_topic(text, store.topics)
        # Sizes and outcome only: email content is never logged.
        logger.info(
            "Brief for %s: subject %d chars, body %d chars, client %s (%s), topic %s",
            user.id,
            len(body.subject),
            len(body.body),
            client.id if client else None,
            matched_by,
            topic.id if topic else None,
        )
        brief: dict = {
            "matched": topic is not None,
            "client": {"id": client.id, "name": client.name, "matched_by": matched_by} if client else None,
            "clients": [{"id": c.id, "name": c.name} for c in own],
            "topic": None,
            "context_label": None,
            "answer": None,
            "sources": [],
            "expert": None,
            "open_request": None,
            "reply": None,
        }
        if topic is None:
            return brief
        with store.lock:
            items = visible_to(user)
            pending = find_open_request(user, topic.id, ctx)
            open_request = (
                {"id": pending.id, "assignee_name": store.people[pending.assignee_id].name} if pending else None
            )
        return brief | brief_payload(topic, ctx, items, user.id, client, user.name) | {"open_request": open_request}

    @app.post("/api/v1/capture", status_code=201)
    def channel_capture(body: ChannelCaptureBody, user: Person = Depends(channel_user)) -> dict:
        """Add one email as a source because the user asked to; unlike the brief, this stores the email text."""
        subject = plain_text(body.subject)
        text = plain_text(body.subject, body.body)[:EMAIL_CAPTURE_CHARS]
        name, address = plain_text(body.sender_name or ""), plain_text(body.sender_email or "")
        sender = f"{name} <{address}>" if name and address else name or address
        logger.info("Email capture for %s: %d chars kept, client %s", user.id, len(text), body.client_id)
        captured = capture_for(
            user,
            text,
            body.client_id,
            kind="email",
            title=subject or "Email",
            # The add-in reports the sender; TrustLabel cannot check it, so the source line says so.
            source=f"Email · from {sender} (as forwarded, unverified)" if sender else None,
        )
        item_id = captured["captured_item_id"]
        ctx = resolve_context(user, body.client_id)
        claims = []
        with store.lock:
            item = next(i for i in store.items() if i.id == item_id)
            items = visible_to(user)
            for claim in item.claims:
                topic = store.topics_by_id[claim.topic_id]
                sources = assess(topic, ctx, items, store.people, store.clients).sources
                graded = next((s for s in sources if s.item.id == item_id), None)
                claims.append(
                    {
                        "topic": topic_view(topic),
                        "value_display": value_display(topic, claim.value),
                        "quote": claim.quote,
                        "valid_until": claim.valid_until.isoformat() if claim.valid_until else None,
                        "grade": graded.grade if graded else None,
                    }
                )
        return captured | {"claims": claims}

    @app.post("/api/v1/verifications", status_code=201)
    def channel_verification(
        body: ChannelVerificationBody, response: Response, user: Person = Depends(channel_user)
    ) -> dict:
        view, created = create_verification_for(user, body.topic_id, body.client_id, body.question)
        if not created:
            response.status_code = 200
        keys = ("id", "assignee_name", "status", "question")
        return {k: view[k] for k in keys}

    def brief_case(case: SalesforceCase) -> str | None:
        """Internal comment for a new Salesforce case: the labelled answer for its client, or why there is none."""
        text = plain_text(case.subject, case.description)
        topic, _ = match_topic(text, store.topics)
        if topic is None:
            return None
        clients = list(store.clients.values())
        client, _ = detect_client(case.account_name or "", None, clients)
        if client is None:
            client, _ = detect_client(text, case.supplied_email, clients)
        if client is None:
            return unscoped_case_text(topic)
        ctx = Context(client.country, client.id, context_label(client.country, client.id), clock())
        with store.lock:
            items = service_desk_items(client)
        logger.info("Salesforce case %s briefed: %s for %s", case.number, topic.id, client.id)
        return brief_text(brief_payload(topic, ctx, items, "", client, None))

    def sync_salesforce_source(source: SalesforceSource) -> str | None:
        """Keep the claims a closed case or logged call states verbatim, scoped to the client it is about.

        The client comes from the account (or related record) name, else from the text, as for case briefs.
        A record no TrustLabel client matches is skipped: a case or call answer is client-specific.
        """
        clients = list(store.clients.values())
        client, _ = detect_client(source.account_name or "", None, clients)
        if client is None:
            client, _ = detect_client(source.text, source.supplied_email, clients)
        if client is None:
            logger.info("Salesforce %s %s skipped: no matching client", source.kind, source.id)
            return None
        if extractor is None or not salesforce_budget.try_add("salesforce", SALESFORCE_AI_CALLS_PER_HOUR):
            logger.warning("Salesforce %s %s skipped: AI budget reached", source.kind, source.id)
            return None
        today = clock()
        try:
            extracted = extractor.extract(source.text, store.topics, today)
        except AI_SERVICE_ERRORS as exc:
            logger.warning("Claim extraction failed: %s", type(exc).__name__)
            return None
        item_id = "SF-" + secrets.token_hex(4).upper()
        claims = claim_rows(item_id, validate_extracted(extracted, source.text, store.topics_by_id, today))
        if not claims:
            logger.info("Salesforce %s %s: no verifiable claim", source.kind, source.id)
            return None
        store.add_item(
            Item(
                id=item_id,
                kind=source.kind,
                title=source.title,
                source=source.source,
                author_id=None,
                owner_id=None,
                created_on=min(source.happened_on, today),
                last_reviewed_on=None,
                review_cycle_days=None,
                countries=[client.country],
                client_ids=[client.id],
                effective_from=None,
                effective_to=None,
                supersedes=[],
                body=evidence_text(source.text, [c.quote for c in claims]),
                claims=claims,
                provenance="connector",
            )
        )
        logger.info("Salesforce %s %s captured as %s for %s", source.kind, source.id, item_id, client.id)
        return item_id

    # --- Integrations page: personal key, channel addresses, shared workspaces (admin) ---

    def public_base(request: Request) -> str:
        return settings.public_url or str(request.base_url).rstrip("/")

    def admin_user(user: Person = Depends(current_user)) -> Person:
        if user.id not in settings.admins:
            raise HTTPException(403, "Only an administrator can change shared integrations")
        return user

    def iso(value: datetime | None) -> str | None:
        return value.isoformat(timespec="seconds") if value else None

    def spott_view(request: Request, is_admin: bool) -> dict:
        """Everyone sees whether Spott works; the workspace details (users, webhook, every client) are admin-only."""
        link = spott_link
        view = {
            "connected": link.api is not None,
            "webhook_ready": link.api is not None and link.key is not None and extractor is not None,
            "notes_captured": len(spott_captures),
            "last_delivery_at": iso(spott_last_delivery),
        }
        if not is_admin:
            return view
        return view | {
            "source": link.source,
            "webhook_url": public_base(request) + WEBHOOK_PATH,
            "users": link.users,
            # Known only after an in-app connect, which looks every client up once.
            "clients": (
                [{"name": c.name, "found": c.id in spott_client_ids} for c in store.clients.values()]
                if link.source == "app"
                else []
            ),
        }

    @app.get("/api/integrations")
    def integrations(request: Request, user: Person = Depends(current_user)) -> dict:
        record = connections.status(user.id)
        base = public_base(request)
        return {
            "is_admin": user.id in settings.admins,
            "key": {"active": record is not None, "expires_at": iso(record.expires_at) if record else None},
            "teams": {
                "mcp_url": base + MCP_PATH,
                "alerts": {"configured": teams_alerts is not None, "mapped_experts": len(settings.teams_users)},
                "sync": {
                    "configured": teams_sync is not None,
                    "graph_configured": graph is not None,
                    "channels": len(settings.teams_sync_channels),
                    "permissions": list(PERMISSIONS),
                    "name_permissions": list(NAME_PERMISSIONS),
                    "last_poll_at": iso(teams_sync.last_poll_at) if teams_sync else None,
                    "messages_seen": teams_sync.messages_seen if teams_sync else 0,
                    "items_created": teams_sync.items_created if teams_sync else 0,
                    "last_error": teams_sync.last_error if teams_sync else None,
                },
            },
            "outlook": {"manifest_url": base + OUTLOOK_MANIFEST_PATH},
            "salesforce": {
                "configured": case_poller is not None,
                "domain": settings.salesforce_domain,
                "last_poll_at": iso(case_poller.last_poll_at) if case_poller else None,
                "cases_briefed": case_poller.cases_briefed if case_poller else 0,
                "last_error": case_poller.last_error if case_poller else None,
                "sources_sync": source_poller is not None,
                "sources_synced": source_poller.sources_synced if source_poller else 0,
                "sources_last_poll_at": iso(source_poller.last_poll_at) if source_poller else None,
                "sources_last_error": source_poller.last_error if source_poller else None,
            },
            "spott": spott_view(request, user.id in settings.admins),
            "talkdesk": {"text": TALKDESK_TEXT},
            "auto_ask": {
                "drafting": "claude" if claude is not None else "template",
                "model": settings.anthropic_model if claude is not None else None,
            },
            "meetings": {
                "configured": meeting_pool is not None,
                "max_mb": MAX_MEETING_BYTES // 1_000_000,
                "folder": meetings_folder_view(),
            },
        }

    @app.post("/api/integrations/spott")
    def connect_spott(body: SpottConnectBody, request: Request, user: Person = Depends(admin_user)) -> dict:
        """Check the key against Spott, map our clients, then switch the workspace in one step. Keys stay in memory."""
        nonlocal spott_link
        secret = (body.webhook_secret or "").strip()
        try:
            key = webhook_key(secret) if secret else None
        except ValueError:
            raise HTTPException(
                400, "The webhook signing secret starts with whsec_ (Spott → Settings → Webhooks)"
            ) from None
        api = spott_factory(body.api_key.strip())
        try:
            users = api.count_users()
            found = {c.id: api.find_client_id(c.name) for c in store.clients.values()}
        except SPOTT_ERRORS as exc:
            if isinstance(api, HttpSpottApi):
                api.close()
            status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
            logger.warning("Spott connect failed: %s %s", type(exc).__name__, status or "")
            if status in (401, 403):
                raise HTTPException(400, "Spott rejected this API key") from None
            raise HTTPException(502, "Spott could not be reached; try again") from None
        spott_link = SpottLink(api=api, key=key, source="app", users=users)
        spott_client_ids.clear()
        spott_client_ids.update({cid: sid for cid, sid in found.items() if sid})
        logger.info("Spott workspace connected by %s", user.id)
        return spott_view(request, True)

    @app.delete("/api/integrations/spott", status_code=204)
    def disconnect_spott(user: Person = Depends(admin_user)) -> Response:
        nonlocal spott_link
        spott_link = SpottLink()
        spott_client_ids.clear()
        logger.info("Spott workspace disconnected by %s", user.id)
        return Response(status_code=204)

    @app.get(OUTLOOK_MANIFEST_PATH, include_in_schema=False)
    def outlook_manifest(request: Request) -> Response:
        """Add-in manifest pointing Outlook at this server's task pane; Outlook requires HTTPS."""
        try:
            xml = manifest_xml(public_base(request))
        except ValueError:
            raise HTTPException(503, "The Outlook add-in needs a public HTTPS address") from None
        return Response(xml, media_type="application/xml")

    # --- Sign in with Google: OIDC code flow + PKCE; the email allowlist decides who you become. ---
    google_on = google_enabled(settings)
    google_accounts = {email.strip().lower(): uid for email, uid in settings.google_accounts.items()}
    check_accounts(google_accounts, store.people)
    if google_on and google_exchange is None:
        google_exchange = http_token_exchange(settings.google_client_id, settings.google_client_secret)

    def google_redirect_uri(request: Request) -> str:
        return public_base(request) + CALLBACK_PATH

    def finish_google(location: str) -> RedirectResponse:
        response = RedirectResponse(location, status_code=303)
        response.delete_cookie(
            FLOW_COOKIE, path=FLOW_COOKIE_PATH, secure=settings.cookie_secure, httponly=True, samesite="lax"
        )
        return response

    @app.get("/api/auth/providers")
    def auth_providers() -> dict:
        return {"google": google_on}

    @app.get("/api/auth/google/start")
    def google_start(request: Request) -> Response:
        if not google_on:
            raise HTTPException(404, "Not found")
        flow = new_flow()
        response = RedirectResponse(
            authorization_url(settings.google_client_id, google_redirect_uri(request), flow), status_code=302
        )
        # Lax, not Strict: Google's redirect back to the callback is a cross-site navigation.
        response.set_cookie(
            FLOW_COOKIE,
            sign_flow(settings.secret_key, flow),
            max_age=FLOW_MAX_AGE_SECONDS,
            path=FLOW_COOKIE_PATH,
            secure=settings.cookie_secure,
            httponly=True,
            samesite="lax",
        )
        return response

    @app.get("/api/auth/google/callback")
    def google_callback(
        request: Request, code: str | None = None, state: str | None = None, error: str | None = None
    ) -> Response:
        if not google_on:
            raise HTTPException(404, "Not found")
        ip = request.client.host if request.client else "unknown"
        # A separate, bounded callback budget cannot poison password or bearer-token login.
        # Capped requests do not allocate another event or emit another warning.
        if not oauth_attempts.try_add(ip, AUTH_MAX_FAILURES_PER_IP):
            return finish_google("/?" + urlencode({"login_error": FAILED}))
        try:
            if error is not None:
                # Provider text is never logged or reflected; only the fixed code goes back.
                raise GoogleAuthError(CANCELLED if error == "access_denied" else FAILED, "provider returned an error")
            flow = load_flow(settings.secret_key, request.cookies.get(FLOW_COOKIE))
            check_state(flow, state)
            if not code:
                raise GoogleAuthError(FAILED, "missing authorization code")
            try:
                tokens = google_exchange(
                    code=code, code_verifier=flow["code_verifier"], redirect_uri=google_redirect_uri(request)
                )
            except (httpx.HTTPError, ValueError) as exc:
                raise GoogleAuthError(FAILED, f"token exchange failed ({type(exc).__name__})") from exc
            claims = decode_id_token(tokens.get("id_token") if isinstance(tokens, dict) else None)
            email = verified_email(claims, client_id=settings.google_client_id, nonce=flow["nonce"], now=time.time())
            user_id = google_accounts.get(email)
            person = store.people.get(user_id) if user_id else None
            if person is None or not person.active:
                raise GoogleAuthError(UNLINKED, "Google account is not linked to an active TrustLabel user")
        except GoogleAuthError as exc:
            logger.warning("Google sign-in failed from %s: %s", ip, exc.reason)
            return finish_google("/?" + urlencode({"login_error": exc.code}))
        oauth_attempts.release(ip)
        issue_session(request, person)
        return finish_google("/")

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    return app
