"""Deterministic trust engine: grades, applicability, conflict triage and expert routing.

Pure functions; `today` is always passed in through `Context`. No AI is involved here:
AI only reads input elsewhere, these rules judge it.
"""

from __future__ import annotations

import re
import secrets
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from .models import Claim, Client, Item, Person, Topic, Verification

BASE_SCORE = {"policy": 80, "procedure": 75, "faq": 65, "teams_message": 60, "verified_answer": 95}
KIND_LABELS = {
    "policy": "Policy",
    "procedure": "Procedure",
    "faq": "FAQ",
    "teams_message": "Teams message",
    "verified_answer": "Verified answer",
}
GRADES = "ABCDEFG"
GRADE_THRESHOLDS = (("A", 95), ("B", 80), ("C", 70), ("D", 60), ("E", 50), ("F", 40))
COUNTRY_NAMES = {"BE": "Belgium", "NL": "Netherlands", "DE": "Germany"}

# Kinds that have an owner and a review cycle.
MANAGED_KINDS = frozenset({"policy", "procedure", "faq", "verified_answer"})
# Kinds strong enough to override a general rule for one client.
AUTHORITATIVE_KINDS = frozenset({"policy", "procedure", "verified_answer"})
# Kinds that can only *claim* a client exception.
INFORMAL_KINDS = frozenset({"teams_message", "faq"})

ORPHANED = -20
REVIEW_OVERDUE = -15
REVIEW_DUE_SOON = -5
REVIEW_DUE_SOON_DAYS = 30
CHAT_AGE = -10
CHAT_MAX_AGE_DAYS = 90
POSSIBLE_EXCEPTION = -10
CONFLICT = -15
CORROBORATED = 10
CONFIRMED_BY_VERIFICATION = 15

STATUS_ORDER = {"effective": 0, "superseded": 1, "overridden": 2, "not_applicable": 3}
VALUE_RANGES = {"day_of_month": (1, 31), "working_days": (1, 30)}
VALUE_ERRORS = {
    "day_of_month": "Value must be a day of the month (1–31)",
    "working_days": "Value must be a number of working days (1–30)",
}


@dataclass(frozen=True)
class Context:
    country: str
    client_id: str | None
    label: str
    today: date


@dataclass(frozen=True)
class Reason:
    code: str
    text: str
    delta: int | None = None
    cap: str | None = None


@dataclass(frozen=True)
class SourceResult:
    item: Item
    claim: Claim
    status: str  # effective | superseded | overridden | not_applicable
    applicability_code: str
    applicability_text: str
    reasons: tuple[Reason, ...]
    score: int
    grade: str


@dataclass(frozen=True)
class Competing:
    value: str
    value_display: str
    best_grade: str
    item_ids: tuple[str, ...]


@dataclass(frozen=True)
class Answer:
    status: str  # verified | consistent | conflict | gap
    action: str  # use | verify | ask_expert
    headline: str
    detail: str
    value: str | None = None
    value_display: str | None = None
    grade: str | None = None
    competing: tuple[Competing, ...] = ()
    verified_by: Person | None = None


@dataclass(frozen=True)
class Assessment:
    sources: tuple[SourceResult, ...]
    answer: Answer

    def source(self, item_id: str) -> SourceResult:
        return next(s for s in self.sources if s.item.id == item_id)


@dataclass(frozen=True)
class ExpertMatch:
    person: Person
    score: int
    reasons: tuple[str, ...]


def grade_for(score: int) -> str:
    for grade, threshold in GRADE_THRESHOLDS:
        if score >= threshold:
            return grade
    return "G"


def ordinal(n: int) -> str:
    suffix = "th" if 11 <= n % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def value_display(topic: Topic, value: str) -> str:
    n = int(value)
    if topic.value_type == "day_of_month":
        return f"{ordinal(n)} of the month"
    return f"within {n} working day{'' if n == 1 else 's'}"


def validate_value(topic: Topic, raw: str) -> str:
    """Normalise a claimed value to a plain integer string, or raise ValueError."""
    text = str(raw).strip()
    lo, hi = VALUE_RANGES[topic.value_type]
    if not re.fullmatch(r"[0-9]{1,3}", text) or not lo <= int(text) <= hi:
        raise ValueError(VALUE_ERRORS[topic.value_type])
    return str(int(text))


def specificity(item: Item) -> int:
    return 2 if item.client_ids else 1


def match_topic(question: str, topics: Sequence[Topic]) -> tuple[Topic | None, list[str]]:
    """Keyword match; most hits wins, ties go to file order."""
    text = question.lower()
    best: Topic | None = None
    best_hits: list[str] = []
    for topic in topics:
        hits = [kw for kw in topic.keywords if kw.lower() in text]
        if len(hits) > len(best_hits):
            best, best_hits = topic, hits
    return best, best_hits


def visible_items(items: Iterable[Item], user: Person) -> list[Item]:
    """Client-specific knowledge is only visible to that client's team (and its own author/owner)."""
    portfolio = set(user.client_ids)
    return [
        item
        for item in items
        if not item.client_ids
        or portfolio.intersection(item.client_ids)
        or user.id in (item.owner_id, item.author_id)
    ]


def country_list(codes: Iterable[str]) -> str:
    return ", ".join(COUNTRY_NAMES.get(c, c) for c in codes)


def _client_list(ids: Iterable[str], clients: Mapping[str, Client]) -> str:
    return ", ".join(clients[c].name if c in clients else c for c in ids)


def _person_name(person_id: str | None, people: Mapping[str, Person]) -> str:
    person = people.get(person_id) if person_id else None
    return person.name if person else "an expert"


def _applicability(item: Item, ctx: Context, clients: Mapping[str, Client]) -> tuple[str, str]:
    if ctx.country not in item.countries:
        return "country_mismatch", f"Applies to {country_list(item.countries)} only"
    if item.client_ids and ctx.client_id not in item.client_ids:
        return "client_mismatch", f"Specific to {_client_list(item.client_ids, clients)}"
    if item.effective_from and item.effective_from > ctx.today:
        return "not_yet_effective", f"Not effective until {item.effective_from.isoformat()}"
    if item.effective_to and item.effective_to < ctx.today:
        return "expired", f"Expired on {item.effective_to.isoformat()}"
    if item.client_ids:
        return "applies", f"Applies to {_client_list(item.client_ids, clients)}"
    return "applies", f"Applies to all clients in {country_list(item.countries)}"


def _intrinsic_reasons(item: Item, today: date, people: Mapping[str, Person]) -> list[Reason]:
    base = BASE_SCORE[item.kind]
    reasons = [Reason("base", f"{KIND_LABELS[item.kind]}: base {base}", base)]
    if item.kind in MANAGED_KINDS:
        owner = people.get(item.owner_id) if item.owner_id else None
        if owner is None:
            reasons.append(Reason("orphaned", "No owner", ORPHANED))
        elif not owner.active:
            left = f" on {owner.left_on.isoformat()}" if owner.left_on else ""
            reasons.append(Reason("orphaned", f"Owner {owner.name} left SD Worx{left}", ORPHANED))
        if item.last_reviewed_on and item.review_cycle_days:
            due = item.last_reviewed_on + timedelta(days=item.review_cycle_days)
            if due < today:
                reasons.append(
                    Reason(
                        "review_overdue",
                        f"Review overdue by {(today - due).days} days "
                        f"(last reviewed {item.last_reviewed_on.isoformat()})",
                        REVIEW_OVERDUE,
                    )
                )
            elif (due - today).days <= REVIEW_DUE_SOON_DAYS:
                reasons.append(
                    Reason(
                        "review_due_soon",
                        f"Review due in {(due - today).days} days ({due.isoformat()})",
                        REVIEW_DUE_SOON,
                    )
                )
    if item.kind == "teams_message":
        age = (today - item.created_on).days
        if age > CHAT_MAX_AGE_DAYS:
            reasons.append(Reason("chat_age", f"Chat message is {age} days old", CHAT_AGE))
    if item.kind == "verified_answer":
        until = f"; valid until {item.effective_to.isoformat()}" if item.effective_to else ""
        reasons.append(
            Reason(
                "verified",
                f"Verified by {_person_name(item.owner_id, people)} on {item.created_on.isoformat()}{until}",
            )
        )
    return reasons


def _score(reasons: Sequence[Reason]) -> tuple[int, str]:
    score = max(0, min(100, sum(r.delta for r in reasons if r.delta is not None)))
    grade = grade_for(score)
    for reason in reasons:
        if reason.cap and GRADES.index(reason.cap) > GRADES.index(grade):
            grade = reason.cap
    return score, grade


def _titles(items: Iterable[Item]) -> str:
    return ", ".join(item.title for item in items)


def assess(
    topic: Topic,
    ctx: Context,
    items: Sequence[Item],
    people: Mapping[str, Person],
    clients: Mapping[str, Client],
) -> Assessment:
    """Grade every source on `topic` for `ctx`. The step order below is load-bearing."""
    entries = [(item, claim) for item in items if (claim := item.claim_for(topic.id)) is not None]
    by_id = {item.id: item for item, _ in entries}
    claims = {item.id: claim for item, claim in entries}
    order = {item.id: index for index, (item, _) in enumerate(entries)}

    def value(item: Item) -> str:
        return claims[item.id].value

    # 1. Applicability to the asker's country / client / date.
    applicability = {item.id: _applicability(item, ctx, clients) for item, _ in entries}
    applicable = [item for item, _ in entries if applicability[item.id][0] == "applies"]

    # 2. Superseded: explicitly listed, or a newer same-scope formal source with another value.
    superseded: dict[str, Item] = {}
    for x in applicable:
        by = next((y for y in applicable if x.id in y.supersedes), None)
        if by is None:
            newer = [
                y
                for y in applicable
                if y is not x
                and specificity(y) == specificity(x)
                and value(y) != value(x)
                and x.effective_from
                and y.effective_from
                and y.kind != "teams_message"
                and y.effective_from > x.effective_from
            ]
            by = max(newer, key=lambda y: y.effective_from, default=None)
        if by is not None:
            superseded[x.id] = by
    current = [item for item in applicable if item.id not in superseded]

    # 3. Overridden: a formal client-specific source beats the general rule for that client.
    overridden: dict[str, Item] = {}
    for x in current:
        if specificity(x) != 1:
            continue
        by = next(
            (
                y
                for y in current
                if specificity(y) == 2 and y.kind in AUTHORITATIVE_KINDS and value(y) != value(x)
            ),
            None,
        )
        if by is not None:
            overridden[x.id] = by

    # 4. Effective set.
    effective = [item for item in current if item.id not in overridden]
    relational: dict[str, list[Reason]] = {item.id: [] for item in effective}

    # 5. Possible client exception claimed only informally.
    informal_specific = [y for y in effective if specificity(y) == 2 and y.kind in INFORMAL_KINDS]
    formal_specific = [y for y in effective if specificity(y) == 2 and y.kind in AUTHORITATIVE_KINDS]
    if informal_specific and not formal_specific:
        for x in effective:
            if specificity(x) != 1:
                continue
            claimant = next((y for y in informal_specific if value(y) != value(x)), None)
            if claimant is not None:
                relational[x.id].append(
                    Reason(
                        "possible_exception",
                        f"Client-specific exception ({value_display(topic, value(claimant))}) "
                        f"claimed in {claimant.source}, not verified",
                        POSSIBLE_EXCEPTION,
                    )
                )

    # 6. True conflict: same scope, different values, no verified answer involved.
    for x in effective:
        if x.kind == "verified_answer":
            continue
        rivals = [
            y
            for y in effective
            if y is not x
            and y.kind != "verified_answer"
            and specificity(y) == specificity(x)
            and value(y) != value(x)
        ]
        if rivals:
            relational[x.id].append(Reason("conflict", f"Conflicts with {_titles(rivals)}", CONFLICT))

    # 7. Corroboration by independent (other author) sources.
    for x in effective:
        backers = [
            y
            for y in effective
            if y is not x
            and y.kind != "verified_answer"
            and value(y) == value(x)
            and y.author_id != x.author_id
        ]
        if backers:
            relational[x.id].append(
                Reason(
                    "corroborated",
                    f"Corroborated by {len(backers)} independent source(s): {_titles(backers)}",
                    CORROBORATED,
                )
            )

    # 8. Expert verifications confirm or contradict the rest.
    verified = [v for v in effective if v.kind == "verified_answer"]
    for x in effective:
        if x.kind == "verified_answer":
            continue
        confirming = next((v for v in verified if value(v) == value(x)), None)
        if confirming is not None:
            relational[x.id].append(
                Reason(
                    "confirmed_by_verification",
                    f"Confirmed by {_person_name(confirming.owner_id, people)}'s verification "
                    f"on {confirming.created_on.isoformat()}",
                    CONFIRMED_BY_VERIFICATION,
                )
            )
        contradicting = next(
            (v for v in verified if value(v) != value(x) and specificity(v) >= specificity(x)),
            None,
        )
        if contradicting is not None:
            relational[x.id].append(
                Reason(
                    "contradicted_by_verification",
                    f"Contradicted by {_person_name(contradicting.owner_id, people)}'s verification "
                    f"({value_display(topic, value(contradicting))}) on {contradicting.created_on.isoformat()}",
                    cap="G",
                )
            )

    # 9–10. Intrinsic reasons, score, grade, status.
    results: list[SourceResult] = []
    for item, claim in entries:
        reasons = _intrinsic_reasons(item, ctx.today, people)
        code, text = applicability[item.id]
        if code != "applies":
            status = "not_applicable"
        elif item.id in superseded:
            status = "superseded"
            by = superseded[item.id]
            since = f" (effective {by.effective_from.isoformat()})" if by.effective_from else ""
            code, text = "superseded", f"Superseded by {by.title}{since}"
            reasons.append(Reason("superseded", text, cap="F"))
        elif item.id in overridden:
            status = "overridden"
            by = overridden[item.id]
            code = "overridden"
            text = f"Overridden for {_client_list(by.client_ids, clients)} by {by.title}"
        else:
            status = "effective"
            reasons.extend(relational[item.id])
        score, grade = _score(reasons)
        results.append(SourceResult(item, claim, status, code, text, tuple(reasons), score, grade))

    results.sort(
        key=lambda s: (STATUS_ORDER[s.status], GRADES.index(s.grade), -s.score, order[s.item.id])
    )
    return Assessment(tuple(results), _answer(topic, ctx, results, by_id, order, people))


def _answer(
    topic: Topic,
    ctx: Context,
    results: Sequence[SourceResult],
    by_id: Mapping[str, Item],
    order: Mapping[str, int],
    people: Mapping[str, Person],
) -> Answer:
    effective = [s for s in results if s.status == "effective"]
    verified = [s for s in effective if s.item.kind == "verified_answer"]
    if verified:
        best = max(
            verified,
            key=lambda s: (specificity(s.item), s.item.created_on, order[s.item.id]),
        )
        expert = people.get(best.item.owner_id) if best.item.owner_id else None
        vd = value_display(topic, best.claim.value)
        who = f"{expert.name} ({expert.title})" if expert else "an expert"
        until = best.item.effective_to.isoformat() if best.item.effective_to else "further notice"
        return Answer(
            status="verified",
            action="use",
            headline=f"{vd} — verified",
            detail=(
                f"Verified by {who} on {best.item.created_on.isoformat()}, valid until {until}. "
                f"Applies to {ctx.label}."
            ),
            value=best.claim.value,
            value_display=vd,
            grade=best.grade,
            verified_by=expert,
        )

    if not effective:
        if not results:
            detail = "Nothing found for this topic."
        elif all(s.applicability_code == "country_mismatch" for s in results):
            countries = sorted({c for s in results for c in s.item.countries})
            detail = f"Only found for {country_list(countries)}."
        else:
            detail = f"None of the {len(results)} source(s) found applies to {ctx.label}."
        return Answer(
            status="gap",
            action="ask_expert",
            headline="No knowledge applies to your context",
            detail=detail,
        )

    disputed = any(r.code in ("possible_exception", "conflict") for s in effective for r in s.reasons)
    if disputed:
        groups: dict[str, list[SourceResult]] = {}
        for s in effective:
            groups.setdefault(s.claim.value, []).append(s)
        competing = sorted(
            (
                Competing(
                    value=val,
                    value_display=value_display(topic, val),
                    best_grade=min((s.grade for s in group), key=GRADES.index),
                    item_ids=tuple(s.item.id for s in group),
                )
                for val, group in groups.items()
            ),
            key=lambda c: (GRADES.index(c.best_grade), order[c.item_ids[0]]),
        )
        listed = " vs ".join(f"{c.value_display} ({c.best_grade})" for c in competing)
        return Answer(
            status="conflict",
            action="ask_expert",
            headline="Don't act yet — sources disagree",
            detail=f"{listed} for {ctx.label}.",
            competing=tuple(competing),
        )

    best = effective[0]
    vd = value_display(topic, best.claim.value)
    return Answer(
        status="consistent",
        action="use" if GRADES.index(best.grade) <= GRADES.index("C") else "verify",
        headline=vd,
        detail=(
            f"{len(effective)} applicable source(s) agree. "
            f"Strongest evidence: {best.item.title} (grade {best.grade})."
        ),
        value=best.claim.value,
        value_display=vd,
        grade=best.grade,
    )


def rank_experts(
    topic: Topic,
    ctx: Context,
    assessment: Assessment,
    people: Mapping[str, Person],
    clients: Mapping[str, Client],
    requester_id: str,
) -> list[ExpertMatch]:
    """Top 3 active experts (never the requester) by client, topic and ownership signals."""
    owned = Counter(
        s.item.owner_id for s in assessment.sources if s.status == "effective" and s.item.owner_id
    )
    matches: list[ExpertMatch] = []
    for person in people.values():
        if not person.active or person.role != "expert" or person.id == requester_id:
            continue
        score = 0
        reasons: list[str] = []
        if ctx.client_id and ctx.client_id in person.client_ids:
            score += 3
            reasons.append(f"Client lead for {_client_list([ctx.client_id], clients)}")
        if topic.id in person.expertise_topics:
            score += 3
            reasons.append(f"Listed expertise: {topic.label}")
        if owned[person.id]:
            score += 2
            reasons.append(f"Owns {owned[person.id]} applicable source(s) on this topic")
        if score == 0:
            continue
        if person.country == ctx.country:
            score += 1
            reasons.append(f"Based in {country_list([ctx.country])}")
        matches.append(ExpertMatch(person, score, tuple(reasons)))
    matches.sort(key=lambda m: (-m.score, m.person.name))
    return matches[:3]


def make_verified_item(
    verification: Verification,
    value: str,
    note: str,
    valid_until: date,
    expert: Person,
    topic: Topic,
    ctx_label: str,
    today: date,
) -> Item:
    """Turn an expert's confirmation into a first-class, expiring knowledge item."""
    item_id = "VER-" + secrets.token_hex(4).upper()
    vd = value_display(topic, value)
    body = f"{topic.label}: {vd}."
    if note:
        body += f" {note}" if note.endswith((".", "!", "?")) else f" {note}."
    if verification.voice_transcript:
        body += f" Voice statement by {expert.name}: “{verification.voice_transcript}”"
    return Item(
        id=item_id,
        kind="verified_answer",
        title=f"Verified: {topic.label} — {ctx_label}",
        source="TrustLabel · Expert verification",
        author_id=expert.id,
        owner_id=expert.id,
        created_on=today,
        last_reviewed_on=today,
        review_cycle_days=(valid_until - today).days,
        countries=[verification.country],
        client_ids=[verification.client_id] if verification.client_id else [],
        effective_from=today,
        effective_to=valid_until,
        supersedes=[],
        body=body,
        claims=[
            Claim(
                id=f"{item_id}-1",
                topic_id=topic.id,
                value=value,
                statement=f"{topic.label} for {ctx_label}: {vd}.",
                quote=vd,
            )
        ],
    )
