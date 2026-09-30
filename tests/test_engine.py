import json
import shutil
from datetime import datetime, timedelta, timezone

import pytest
from conftest import DATA_DIR, TODAY

from trustlabel.engine import Context, assess, make_verified_item, rank_experts, visible_items
from trustlabel.models import Verification
from trustlabel.store import Store

CUTOFF = "payroll.variables_cutoff"
VAN_DAM = Context("BE", "vandam", "Van Dam Logistics NV (BE)", TODAY)
BELGIUM = Context("BE", None, "Belgium — all clients", TODAY)


def run(store, topic_id, ctx, user="lotte"):
    items = visible_items(store.items(), store.people[user])
    return assess(store.topics_by_id[topic_id], ctx, items, store.people, store.clients)


def grades(assessment):
    return {s.item.id: (s.grade, s.score) for s in assessment.sources if s.status == "effective"}


def verify(store, value, client_id="vandam"):
    request = Verification(
        id="vr_test",
        topic_id=CUTOFF,
        country="BE",
        client_id=client_id,
        question="What's the cut-off?",
        requester_id="lotte",
        assignee_id="ellen",
        status="open",
        created_at=datetime(2026, 9, 30, 12, tzinfo=timezone.utc),
        candidates=[],
    )
    item = make_verified_item(
        request,
        value,
        "",
        TODAY + timedelta(days=180),
        store.people["ellen"],
        store.topics_by_id[CUTOFF],
        VAN_DAM.label,
        TODAY,
    )
    store.add_item(item)
    return item


def test_van_dam_story_is_triaged_into_a_conflict_with_explained_grades(store):
    result = run(store, CUTOFF, VAN_DAM)

    assert result.answer.status == "conflict"
    assert result.answer.action == "ask_expert"
    assert result.answer.detail.startswith("20th of the month (C) vs 25th of the month (D)")
    assert grades(result) == {"DOC-BE-017": ("C", 75), "FAQ-BE-003": ("D", 65), "TEAMS-4411": ("D", 60)}
    outdated = result.source("DOC-BE-009")
    assert (outdated.status, outdated.grade, outdated.score) == ("superseded", "F", 40)
    assert {"superseded", "orphaned", "review_overdue"} <= {r.code for r in outdated.reasons}
    dutch = result.source("DOC-NL-004")
    assert (dutch.status, dutch.applicability_code) == ("not_applicable", "country_mismatch")

    experts = rank_experts(
        store.topics_by_id[CUTOFF], VAN_DAM, result, store.people, store.clients, "lotte"
    )
    assert [(m.person.id, m.score) for m in experts] == [("ellen", 9), ("pieter", 6)]


def test_general_belgian_context_ignores_client_exception(store):
    result = run(store, CUTOFF, BELGIUM)

    assert (result.answer.status, result.answer.value, result.answer.action) == ("consistent", "20", "use")
    assert result.source("DOC-BE-017").grade == "B"
    teams = result.source("TEAMS-4411")
    assert (teams.status, teams.applicability_code) == ("not_applicable", "client_mismatch")


def test_client_verification_overrides_general_rule_only_for_that_client(store):
    verified = verify(store, "25")

    van_dam = run(store, CUTOFF, VAN_DAM)
    assert (van_dam.answer.status, van_dam.answer.value, van_dam.answer.grade) == ("verified", "25", "A")
    assert van_dam.source(verified.id).score == 100
    assert van_dam.source("DOC-BE-017").status == "overridden"
    assert van_dam.source("FAQ-BE-003").status == "overridden"
    assert van_dam.source("TEAMS-4411").grade == "C"

    general = run(store, CUTOFF, BELGIUM)
    assert (general.answer.status, general.answer.value, general.answer.grade) == ("consistent", "20", "B")


def test_verification_contradicting_chat_caps_it_at_g(store):
    verify(store, "20")

    result = run(store, CUTOFF, VAN_DAM)
    assert (result.answer.status, result.answer.value) == ("verified", "20")
    assert result.source("TEAMS-4411").grade == "G"
    assert "confirmed_by_verification" in {r.code for r in result.source("DOC-BE-017").reasons}


def test_gap_when_only_other_countries_know_and_routes_to_local_expert(store):
    result = run(store, "leave.sick_certificate", BELGIUM)

    assert (result.answer.status, result.answer.action) == ("gap", "ask_expert")
    assert result.answer.detail == "Only found for Netherlands."
    experts = rank_experts(
        store.topics_by_id["leave.sick_certificate"], BELGIUM, result, store.people, store.clients, "lotte"
    )
    assert experts[0].person.id == "anke"


def test_store_rejects_claim_quote_missing_from_body(tmp_path):
    data = tmp_path / "data"
    shutil.copytree(DATA_DIR, data)
    items = json.loads((data / "items.json").read_text(encoding="utf-8"))
    items[0]["claims"][0]["quote"] = "must be submitted by the 25th of the month"
    (data / "items.json").write_text(json.dumps(items), encoding="utf-8")

    with pytest.raises(ValueError, match="DOC-BE-017"):
        Store(data)
