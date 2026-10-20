"""Loads and validates the knowledge base; holds in-memory runtime state (a restart resets the demo)."""

from __future__ import annotations

import json
import threading
from pathlib import Path

from .engine import validate_value
from .models import Client, Item, Person, Topic, Verification

COUNTRIES = frozenset({"BE", "NL", "DE"})

MAX_RUNTIME_ITEMS = 500
MAX_RUNTIME_ITEMS_PER_AUTHOR = 100
MAX_RUNTIME_BYTES = 4_000_000
MAX_RUNTIME_BYTES_PER_AUTHOR = 1_000_000
MAX_VERIFICATIONS = 500
MAX_VERIFICATIONS_PER_REQUESTER = 100


class StoreCapacityError(ValueError):
    """The in-memory demo has reached a retention quota; existing evidence is never silently evicted."""


def _load(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


class Store:
    def __init__(self, data_dir: Path) -> None:
        self.people = {p.id: p for p in map(Person.model_validate, _load(data_dir / "people.json"))}
        self.clients = {c.id: c for c in map(Client.model_validate, _load(data_dir / "clients.json"))}
        self.topics = [Topic.model_validate(t) for t in _load(data_dir / "topics.json")]
        self.topics_by_id = {t.id: t for t in self.topics}
        self._validate_people()

        items = [Item.model_validate(raw) for raw in _load(data_dir / "items.json")]
        known_ids: set[str] = set()
        for item in items:
            if item.id in known_ids:
                raise ValueError(f"{item.id}: duplicate item id")
            known_ids.add(item.id)
        for item in items:
            self._check(item, known_ids)
        self.base_items = items
        self._item_ids = known_ids
        self._runtime_bytes = 0
        self._author_counts: dict[str | None, int] = {}
        self._author_bytes: dict[str | None, int] = {}
        self._verification_bytes = 0
        self._requester_counts: dict[str, int] = {}
        self._requester_bytes: dict[str, int] = {}

        self.runtime_items: list[Item] = []
        self.verifications: dict[str, Verification] = {}
        self.lock = threading.RLock()

    def items(self) -> list[Item]:
        with self.lock:
            return [*self.base_items, *self.runtime_items]

    def add_item(self, item: Item) -> None:
        """Atomically validate and retain an item within global and publisher count/byte quotas."""
        size = len(item.model_dump_json().encode("utf-8"))
        author = item.author_id
        with self.lock:
            if item.id in self._item_ids:
                raise ValueError(f"{item.id}: duplicate item id")
            if (
                len(self.runtime_items) >= MAX_RUNTIME_ITEMS
                or self._author_counts.get(author, 0) >= MAX_RUNTIME_ITEMS_PER_AUTHOR
                or self._runtime_bytes + size > MAX_RUNTIME_BYTES
                or self._author_bytes.get(author, 0) + size > MAX_RUNTIME_BYTES_PER_AUTHOR
            ):
                raise StoreCapacityError("Knowledge storage capacity reached")
            self._check(item, self._item_ids)
            self.runtime_items.append(item)
            self._item_ids.add(item.id)
            self._runtime_bytes += size
            self._author_counts[author] = self._author_counts.get(author, 0) + 1
            self._author_bytes[author] = self._author_bytes.get(author, 0) + size

    def add_verification(self, verification: Verification) -> None:
        """Bound retained requests, including resolved requests and their candidate snapshots."""
        size = len(verification.model_dump_json().encode("utf-8"))
        requester = verification.requester_id
        with self.lock:
            if verification.id in self.verifications:
                raise ValueError("Duplicate verification id")
            if (
                len(self.verifications) >= MAX_VERIFICATIONS
                or self._requester_counts.get(requester, 0) >= MAX_VERIFICATIONS_PER_REQUESTER
                or self._verification_bytes + size > MAX_RUNTIME_BYTES
                or self._requester_bytes.get(requester, 0) + size > MAX_RUNTIME_BYTES_PER_AUTHOR
            ):
                raise StoreCapacityError("Verification storage capacity reached")
            self.verifications[verification.id] = verification
            self._verification_bytes += size
            self._requester_counts[requester] = self._requester_counts.get(requester, 0) + 1
            self._requester_bytes[requester] = self._requester_bytes.get(requester, 0) + size

    def _validate_people(self) -> None:
        for person in self.people.values():
            for client_id in person.client_ids:
                if client_id not in self.clients:
                    raise ValueError(f"{person.id}: unknown client {client_id}")
            for topic_id in person.expertise_topics:
                if topic_id not in self.topics_by_id:
                    raise ValueError(f"{person.id}: unknown topic {topic_id}")

    def _check(self, item: Item, known_ids: set[str]) -> None:
        for person_id in (item.author_id, item.owner_id):
            if person_id is not None and person_id not in self.people:
                raise ValueError(f"{item.id}: unknown person {person_id}")
        for client_id in item.client_ids:
            if client_id not in self.clients:
                raise ValueError(f"{item.id}: unknown client {client_id}")
        if not item.countries or not set(item.countries) <= COUNTRIES:
            raise ValueError(f"{item.id}: countries must be within {sorted(COUNTRIES)}")
        for superseded_id in item.supersedes:
            if superseded_id not in known_ids or superseded_id == item.id:
                raise ValueError(f"{item.id}: supersedes unknown item {superseded_id}")
        seen_topics: set[str] = set()
        for claim in item.claims:
            topic = self.topics_by_id.get(claim.topic_id)
            if topic is None:
                raise ValueError(f"{item.id}: unknown topic {claim.topic_id}")
            if claim.topic_id in seen_topics:
                raise ValueError(f"{item.id}: more than one claim for {claim.topic_id}")
            seen_topics.add(claim.topic_id)
            if not claim.quote or claim.quote not in item.body:
                raise ValueError(f"{item.id}: quote of {claim.id} is not verbatim in the body")
            try:
                normalised = validate_value(topic, claim.value)
            except ValueError as exc:
                raise ValueError(f"{item.id}: invalid value for {claim.id}: {exc}") from None
            if normalised != claim.value:
                raise ValueError(f"{item.id}: value of {claim.id} must be a plain integer string")
