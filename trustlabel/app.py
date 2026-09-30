"""FastAPI app: per-user auth, trust-labelled answers, expert verification workflow, security middleware."""

from __future__ import annotations

import logging
import re
import secrets
import threading
import time
from collections import deque
from collections.abc import Callable, Hashable
from datetime import date, datetime, timedelta
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.sessions import SessionMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .ai import (
    AI_SERVICE_ERRORS,
    ElevenLabsTranscriber,
    Extractor,
    OpenAIExtractor,
    Transcriber,
    validate_extracted,
)
from .config import REPO_ROOT, Settings
from .credentials import load_credentials, verify_password
from .engine import (
    COUNTRY_NAMES,
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
from .models import (
    AskBody,
    Candidate,
    CaptureBody,
    Claim,
    Item,
    LoginBody,
    Person,
    Resolution,
    ResolveBody,
    Topic,
    Verification,
    VerificationCreateBody,
)
from .store import Store

STATIC_DIR = REPO_ROOT / "static"
MAX_BODY_BYTES = 3_000_000
SESSION_COOKIE = "trustlabel_session"
SESSION_MAX_AGE_SECONDS = 8 * 3600
LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW_SECONDS = 300
MAX_OPEN_REQUESTS_PER_USER = 10
MAX_VALIDITY_DAYS = 730
MAX_AUDIO_BYTES = 2_000_000
MAX_TRANSCRIPT_CHARS = 5_000
AI_CALLS_PER_HOUR = 20
AI_FAILED = "Speech or AI service failed; try again or answer manually"
logger = logging.getLogger("trustlabel")
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
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

    def try_add(self, key: Hashable, limit: int) -> bool:
        """Record an event unless `limit` events already happened inside the window."""
        with self._lock:
            now = self._clock()
            if len(self._events) > self.MAX_KEYS:
                for stale in [k for k, ev in self._events.items() if not ev or now - ev[-1] >= self._window]:
                    del self._events[stale]
            events = self._recent(key, now)
            if len(events) >= limit:
                return False
            events.append(now)
            return True

    def clear(self, key: Hashable) -> None:
        with self._lock:
            self._events.pop(key, None)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_api = scope["path"].startswith("/api/")

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    headers[name] = value
                if is_api:
                    headers["Cache-Control"] = "no-store"
            await send(message)

        await self.app(scope, receive, send_with_headers)


class RequestGuardMiddleware:
    """Rejects oversized bodies and cross-origin state-changing requests before any handler runs."""

    def __init__(self, app: ASGIApp, max_body: int) -> None:
        self.app = app
        self.max_body = max_body

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        declared = headers.get("content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > self.max_body):
            await JSONResponse({"detail": "Request too large"}, status_code=413)(scope, receive, send)
            return
        if scope["method"] in UNSAFE_METHODS:
            origin = headers.get("origin")
            if origin is not None and urlsplit(origin).netloc != headers.get("host", ""):
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
                if received > self.max_body:
                    raise HTTPException(413, "Request too large")
            return message

        await self.app(scope, limited_receive, send)


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
) -> FastAPI:
    store = Store(settings.data_dir)
    credentials = load_credentials(settings.credentials_file)
    sessions: dict[str, str] = {}
    login_failures = SlidingWindow(LOGIN_WINDOW_SECONDS)
    ai_budget = SlidingWindow(3600)
    if extractor is None and settings.openai_api_key:
        extractor = OpenAIExtractor(settings.openai_api_key, settings.openai_model)
    if transcriber is None and settings.elevenlabs_api_key:
        transcriber = ElevenLabsTranscriber(settings.elevenlabs_api_key, settings.elevenlabs_stt_model)

    app = FastAPI(title="TrustLabel", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store
    app.state.sessions = sessions
    app.add_exception_handler(RequestValidationError, _validation_error)
    # Added innermost first: headers wrap the guard, the guard wraps the session layer.
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.secret_key,
        session_cookie=SESSION_COOKIE,
        max_age=SESSION_MAX_AGE_SECONDS,
        same_site="strict",
        https_only=settings.cookie_secure,
    )
    app.add_middleware(RequestGuardMiddleware, max_body=MAX_BODY_BYTES)
    app.add_middleware(SecurityHeadersMiddleware)

    def current_user(request: Request) -> Person:
        sid = request.session.get("sid")
        user_id = sessions.get(sid) if isinstance(sid, str) else None
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
                and v.requester_id == user.id
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
            "author_name": author.name if author else None,
            "owner_name": owner.name if owner else None,
            "owner_active": bool(owner and owner.active),
            "created_on": item.created_on.isoformat(),
            "last_reviewed_on": item.last_reviewed_on.isoformat() if item.last_reviewed_on else None,
            "statement": result.claim.statement,
            "quote": result.claim.quote,
            "body": item.body,
            "value": result.claim.value,
            "value_display": value_display(topic, result.claim.value),
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
            "requester_name": store.people[v.requester_id].name,
            "assignee_name": store.people[v.assignee_id].name,
            "is_assignee": v.assignee_id == user.id,
            "status": v.status,
            "created_at": v.created_at.isoformat(timespec="seconds"),
            "candidates": [c.model_dump() for c in v.candidates],
            "voice_transcript": v.voice_transcript,
            "resolution": v.resolution.model_dump(mode="json") if v.resolution else None,
        }

    def build_ask_result(user: Person, topic: Topic, ctx: Context, matched: list[str]) -> dict:
        with store.lock:
            assessment = assess(topic, ctx, visible_items(store.items(), user), store.people, store.clients)
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
    def login(body: LoginBody, request: Request) -> dict:
        username = body.username.strip().lower()
        key = (username, request.client.host if request.client else "unknown")
        # Each attempt takes a slot up front; a successful login frees them again.
        if not login_failures.try_add(key, LOGIN_MAX_FAILURES):
            raise HTTPException(429, "Too many failed attempts. Try again in 5 minutes.")
        person = store.people.get(username)
        encoded = credentials.get(username) if person is not None and person.active else None
        if not verify_password(body.password, encoded) or person is None:
            raise HTTPException(401, "Invalid username or password")
        login_failures.clear(key)
        previous = request.session.get("sid")
        if isinstance(previous, str):
            sessions.pop(previous, None)
        request.session.clear()
        sid = secrets.token_urlsafe(24)
        sessions[sid] = person.id
        request.session["sid"] = sid
        return {"user": user_view(person)}

    @app.post("/api/logout", status_code=204)
    def logout(request: Request) -> Response:
        sid = request.session.get("sid")
        if isinstance(sid, str):
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
            },
        }

    @app.post("/api/ask")
    def ask(body: AskBody, user: Person = Depends(current_user)) -> dict:
        question = body.question.strip()
        if not question and not body.topic_id:
            raise HTTPException(422, "Type a question or pick a topic")
        ctx = resolve_context(user, body.client_id)
        if body.topic_id is not None:
            topic = store.topics_by_id.get(body.topic_id)
            if topic is None:
                raise HTTPException(404, "Unknown topic")
            matched: list[str] = []
        else:
            topic, matched = match_topic(question, store.topics)
            if topic is None:
                return {"topic": None, "suggestions": [topic_view(t) for t in store.topics]}
        return build_ask_result(user, topic, ctx, matched)

    @app.get("/api/verifications")
    def list_verifications(user: Person = Depends(current_user)) -> dict:
        with store.lock:
            mine = [v for v in store.verifications.values() if user.id in (v.requester_id, v.assignee_id)]
            mine.sort(key=lambda v: (v.status != "open", -v.created_at.timestamp()))
            return {"items": [verification_view(v, user) for v in mine]}

    @app.post("/api/verifications", status_code=201)
    def create_verification(
        body: VerificationCreateBody, response: Response, user: Person = Depends(current_user)
    ) -> dict:
        topic = store.topics_by_id.get(body.topic_id)
        if topic is None:
            raise HTTPException(404, "Unknown topic")
        ctx = resolve_context(user, body.client_id)
        question = body.question.strip()
        if not question:
            raise HTTPException(422, "Question must not be empty")
        with store.lock:
            # Server recomputes everything; the client never chooses the verifier or the candidates.
            assessment = assess(topic, ctx, visible_items(store.items(), user), store.people, store.clients)
            if assessment.answer.status == "verified":
                raise HTTPException(409, "Already verified for this context")
            existing = find_open_request(user, topic.id, ctx)
            if existing is not None:
                response.status_code = 200
                return verification_view(existing, user)
            open_count = sum(
                1 for v in store.verifications.values() if v.requester_id == user.id and v.status == "open"
            )
            if open_count >= MAX_OPEN_REQUESTS_PER_USER:
                raise HTTPException(429, "Too many open verification requests")
            experts = rank_experts(topic, ctx, assessment, store.people, store.clients, user.id)
            if not experts:
                raise HTTPException(422, "No expert available for this topic and context")
            verification = Verification(
                id="vr_" + secrets.token_urlsafe(9),
                topic_id=topic.id,
                country=ctx.country,
                client_id=ctx.client_id,
                question=question,
                requester_id=user.id,
                assignee_id=experts[0].person.id,
                status="open",
                created_at=datetime.now().astimezone(),
                candidates=[
                    Candidate(
                        value=s.claim.value,
                        value_display=value_display(topic, s.claim.value),
                        item_id=s.item.id,
                        title=s.item.title,
                        grade=s.grade,
                    )
                    for s in assessment.sources
                    if s.status == "effective"
                ],
            )
            store.verifications[verification.id] = verification
            return verification_view(verification, user)

    def assigned_open_request(vid: str, user: Person) -> Verification:
        """Only the assignee may act; everyone else gets the same 404 as for a missing id."""
        verification = store.verifications.get(vid)
        if verification is None or verification.assignee_id != user.id:
            raise HTTPException(404, "Verification request not found")
        if verification.status != "open":
            raise HTTPException(409, "Already resolved")
        return verification

    @app.post("/api/verifications/{vid}/resolve")
    def resolve_verification(vid: str, body: ResolveBody, user: Person = Depends(current_user)) -> dict:
        today = clock()
        with store.lock:
            verification = assigned_open_request(vid, user)
            topic = store.topics_by_id[verification.topic_id]
            try:
                value = validate_value(topic, body.value)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from None
            if not today < body.valid_until <= today + timedelta(days=MAX_VALIDITY_DAYS):
                raise HTTPException(422, "Valid until must be after today and at most 2 years ahead")
            note = body.note.strip()
            item = make_verified_item(
                verification,
                value,
                note,
                body.valid_until,
                user,
                topic,
                context_label(verification.country, verification.client_id),
                today,
            )
            store.add_item(item)
            resolution = Resolution(
                value=value,
                value_display=value_display(topic, value),
                note=note,
                valid_until=body.valid_until,
                resolved_at=datetime.now().astimezone().replace(microsecond=0),
                item_id=item.id,
            )
            key = (verification.topic_id, verification.country, verification.client_id)
            for other in store.verifications.values():
                if other.status == "open" and (other.topic_id, other.country, other.client_id) == key:
                    other.status = "resolved"
                    other.resolution = resolution
            return verification_view(verification, user)

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
            assigned_open_request(vid, user).voice_transcript = transcript
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

    @app.post("/api/capture", status_code=201)
    def capture(body: CaptureBody, user: Person = Depends(current_user)) -> dict:
        """Turn a pasted Teams message into graded claims; only verbatim-quoted claims survive."""
        ctx = resolve_context(user, body.client_id)
        if extractor is None:
            raise HTTPException(503, "Capture is not configured")
        text = body.text.strip()
        if not text:
            raise HTTPException(422, "Paste the message text")
        if not ai_budget.try_add(user.id, AI_CALLS_PER_HOUR):
            raise HTTPException(429, "AI usage limit reached; try again later")
        try:
            extracted = extractor.extract(text, store.topics, ctx.today)
        except AI_SERVICE_ERRORS as exc:
            logger.warning("Claim extraction failed: %s", exc)
            raise HTTPException(502, AI_FAILED) from None
        claims = {}
        for claim in validate_extracted(extracted, text, store.topics_by_id, ctx.today):
            claims.setdefault(claim.topic.id, claim)
        if not claims:
            raise HTTPException(422, "No verifiable claim found in the text (quotes must appear verbatim)")
        item_id = "CAP-" + secrets.token_hex(4).upper()
        client_specific = ctx.client_id is not None and any(c.client_specific for c in claims.values())
        item = Item(
            id=item_id,
            kind="teams_message",
            title=f"{user.name} (captured)",
            source="Teams · captured via TrustLabel",
            author_id=user.id,
            owner_id=None,
            created_on=ctx.today,
            last_reviewed_on=None,
            review_cycle_days=None,
            countries=[ctx.country],
            client_ids=[ctx.client_id] if client_specific and ctx.client_id else [],
            effective_from=None,
            effective_to=None,
            supersedes=[],
            body=text,
            claims=[
                Claim(
                    id=f"{item_id}-{n}",
                    topic_id=claim.topic.id,
                    value=claim.value,
                    statement=f"{claim.topic.label}: {claim.value_display}",
                    quote=claim.quote,
                )
                for n, claim in enumerate(claims.values(), start=1)
            ],
        )
        store.add_item(item)
        first_topic = next(iter(claims.values())).topic
        return {"captured_item_id": item_id, "result": build_ask_result(user, first_topic, ctx, [])}

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    return app
