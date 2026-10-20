from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pytest

import trustlabel.store as storage
from trustlabel.models import Verification
from trustlabel.store import StoreCapacityError


def runtime_item(store, number, author="lotte"):
    return store.base_items[0].model_copy(update={"id": f"CAP-LIMIT-{number}", "author_id": author})


def test_author_quota_preserves_existing_evidence_and_other_publishers(store, monkeypatch):
    monkeypatch.setattr(storage, "MAX_RUNTIME_ITEMS_PER_AUTHOR", 2)
    for number in range(2):
        store.add_item(runtime_item(store, number))
    with pytest.raises(StoreCapacityError):
        store.add_item(runtime_item(store, 2))
    store.add_item(runtime_item(store, 3, "jonas"))
    assert [item.id for item in store.runtime_items] == ["CAP-LIMIT-0", "CAP-LIMIT-1", "CAP-LIMIT-3"]


def test_global_byte_quota_rejects_before_mutation(store, monkeypatch):
    first = runtime_item(store, 0)
    monkeypatch.setattr(storage, "MAX_RUNTIME_BYTES", len(first.model_dump_json().encode("utf-8")))
    store.add_item(first)
    with pytest.raises(StoreCapacityError):
        store.add_item(runtime_item(store, 1, "jonas"))
    assert store.runtime_items == [first]


def test_author_byte_quota_cannot_be_evaded_with_many_small_items(store, monkeypatch):
    first = runtime_item(store, 0)
    monkeypatch.setattr(storage, "MAX_RUNTIME_BYTES_PER_AUTHOR", len(first.model_dump_json().encode("utf-8")))
    store.add_item(first)
    with pytest.raises(StoreCapacityError):
        store.add_item(runtime_item(store, 1))
    store.add_item(runtime_item(store, 2, "jonas"))
    assert [item.author_id for item in store.runtime_items] == ["lotte", "jonas"]


def test_global_item_admission_is_atomic(store, monkeypatch):
    monkeypatch.setattr(storage, "MAX_RUNTIME_ITEMS", 3)

    def insert(number):
        try:
            store.add_item(runtime_item(store, number))
        except StoreCapacityError:
            return False
        return True

    with ThreadPoolExecutor(max_workers=8) as pool:
        accepted = list(pool.map(insert, range(12)))
    assert accepted.count(True) == 3
    assert len(store.runtime_items) == 3


def test_resolving_requests_does_not_free_unbounded_retention(store, monkeypatch):
    monkeypatch.setattr(storage, "MAX_VERIFICATIONS_PER_REQUESTER", 1)
    request = Verification(
        id="vr_limit", topic_id="payroll.variables_cutoff", country="BE", client_id=None,
        question="Cut-off?", requester_id="lotte", assignee_id="ellen", status="open",
        created_at=datetime.now(UTC), candidates=[],
    )
    store.add_verification(request)
    request.status = "resolved"
    with pytest.raises(StoreCapacityError):
        store.add_verification(request.model_copy(update={"id": "vr_second", "status": "open"}))
    store.add_verification(request.model_copy(update={"id": "vr_other", "requester_id": "jonas"}))
    assert set(store.verifications) == {"vr_limit", "vr_other"}
