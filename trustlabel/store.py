"""Loads and validates the knowledge base; holds in-memory runtime state (a restart resets the demo)."""

from __future__ import annotations

import json
import threading
from pathlib import Path

from .engine import validate_value
from .models import Client, Item, Person, Topic, Verification

COUNTRIES = frozenset({"BE", "NL", "DE"})


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

        self.runtime_items: list[Item] = []
        self.verifications: dict[str, Verification] = {}
        self.lock = threading.RLock()

    def items(self) -> list[Item]:
        with self.lock:
            return [*self.base_items, *self.runtime_items]

    def add_item(self, item: Item) -> None:
        """Add a runtime item (verified answer or captured message) after the same checks as seed data."""
        with self.lock:
            known_ids = {i.id for i in self.items()}
            if item.id in known_ids:
                raise ValueError(f"{item.id}: duplicate item id")
            self._check(item, known_ids)
            self.runtime_items.append(item)

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
