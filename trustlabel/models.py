"""Domain models (seed data + runtime verification state) and API request bodies."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Kind = Literal["policy", "procedure", "faq", "teams_message", "verified_answer"]
ValueType = Literal["day_of_month", "working_days"]


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


class Topic(BaseModel):
    id: str
    label: str
    value_type: ValueType
    keywords: list[str]


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


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginBody(StrictBody):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class AskBody(StrictBody):
    question: str = Field(default="", max_length=300)
    client_id: str | None = Field(default=None, max_length=64)
    topic_id: str | None = Field(default=None, max_length=64)


class VerificationCreateBody(StrictBody):
    topic_id: str = Field(min_length=1, max_length=64)
    client_id: str | None = Field(default=None, max_length=64)
    question: str = Field(min_length=1, max_length=300)


class ResolveBody(StrictBody):
    value: str = Field(min_length=1, max_length=10)
    note: str = Field(default="", max_length=500)
    valid_until: date


class CaptureBody(StrictBody):
    text: str = Field(min_length=1, max_length=1000)
    client_id: str | None = Field(default=None, max_length=64)
