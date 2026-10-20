"""Domain models (seed data + runtime verification state) and API request bodies."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Kind = Literal[
    "policy",
    "procedure",
    "faq",
    "teams_message",
    "spott_note",
    "meeting",
    "meeting_summary",
    "email",
    "phone_call",
    "salesforce_case",
    "note",
    "verified_answer",
]
# Kinds a person can paste or forward into TrustLabel themselves.
CaptureKind = Literal["teams_message", "email", "meeting_summary", "phone_call", "note"]
ValueType = Literal["day_of_month", "working_days", "amount_eur"]


class Person(BaseModel):
    id: str
    name: str
    title: str
    country: str
    role: Literal["consultant", "expert"]
    active: bool
    left_on: date | None = None
    client_ids: list[str] = []
    expertise_topics: list[str] = []


class Client(BaseModel):
    id: str
    name: str
    country: str
    sector: str
    # Other names people use for the client in emails, cases and calls (matched as whole words).
    aliases: list[str] = []
    # Email domains of the client's own staff; a sender on one of them identifies the client.
    email_domains: list[str] = []


class Topic(BaseModel):
    id: str
    label: str
    value_type: ValueType
    keywords: list[str]
    # Shown after amounts, e.g. "per month" → "€750 per month".
    unit: str | None = None


class Claim(BaseModel):
    id: str
    topic_id: str
    value: str
    statement: str
    quote: str


class Item(BaseModel):
    id: str
    kind: Kind
    title: str
    source: str
    author_id: str | None
    owner_id: str | None
    created_on: date
    last_reviewed_on: date | None
    review_cycle_days: int | None
    countries: list[str]
    client_ids: list[str]
    effective_from: date | None
    effective_to: date | None
    supersedes: list[str]
    body: str
    claims: list[Claim]

    def claim_for(self, topic_id: str) -> Claim | None:
        return next((c for c in self.claims if c.topic_id == topic_id), None)


class Candidate(BaseModel):
    value: str
    value_display: str
    item_id: str
    title: str
    grade: str


class Resolution(BaseModel):
    value: str
    value_display: str
    note: str
    valid_until: date
    resolved_at: datetime
    item_id: str


class Verification(BaseModel):
    id: str
    topic_id: str
    country: str
    client_id: str | None
    question: str
    requester_id: str
    assignee_id: str
    status: Literal["open", "resolved"]
    created_at: datetime
    candidates: list[Candidate]
    voice_transcript: str | None = None
    voice_value: str | None = None
    resolution: Resolution | None = None
    # The requester's own wording; `question` holds the drafted question the expert receives.
    asked: str | None = None
    # Other users whose auto-ask reused this open request; they see it in their inbox too.
    follower_ids: list[str] = []


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginBody(StrictBody):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class AskBody(StrictBody):
    question: str = Field(default="", max_length=300)
    client_id: str | None = Field(default=None, max_length=64)
    topic_id: str | None = Field(default=None, max_length=64)
    auto_ask: bool = False


class VerificationCreateBody(StrictBody):
    topic_id: str = Field(min_length=1, max_length=64)
    client_id: str | None = Field(default=None, max_length=64)
    question: str = Field(min_length=1, max_length=300)


class ResolveBody(StrictBody):
    value: str = Field(min_length=1, max_length=10)
    note: str = Field(default="", max_length=500)
    valid_until: date


class CaptureBody(StrictBody):
    text: str = Field(min_length=1, max_length=4000)
    client_id: str | None = Field(default=None, max_length=64)
    kind: CaptureKind = "teams_message"


class BriefBody(StrictBody):
    """An email (or case) a channel wants a trust brief for."""

    subject: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=20_000)
    sender: str | None = Field(default=None, max_length=320)
    client_id: str | None = Field(default=None, max_length=64)


class ChannelCaptureBody(StrictBody):
    """An email the user chose to add as a source; the server keeps at most EMAIL_CAPTURE_CHARS of it."""

    subject: str = Field(default="", max_length=500)
    sender_name: str | None = Field(default=None, max_length=200)
    sender_email: str | None = Field(default=None, max_length=320)
    body: str = Field(default="", max_length=20_000)
    client_id: str | None = Field(default=None, max_length=64)


class ChannelVerificationBody(StrictBody):
    topic_id: str = Field(min_length=1, max_length=64)
    client_id: str | None = Field(default=None, max_length=64)
    question: str = Field(min_length=1, max_length=2000)


class SpottConnectBody(StrictBody):
    api_key: str = Field(min_length=1, max_length=512)
    webhook_secret: str | None = Field(default=None, max_length=256)
