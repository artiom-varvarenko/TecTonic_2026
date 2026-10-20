"""Internal, informal knowledge: the car-policy conflict, the restricted-data guard and euro amounts."""

import pytest
from conftest import TODAY, login
from fastapi.testclient import TestClient
from test_mcp import call, connect

from trustlabel.ai import ExtractedClaim, quote_states_value, validate_extracted
from trustlabel.engine import GRADES, validate_value, value_display
from trustlabel.guard import restricted
from trustlabel.models import Topic

CAR_QUESTION = {"question": "What is my company car lease budget?", "client_id": None}
CAR_TOPIC = Topic(
    id="mobility.car_lease_budget", label="Company car lease budget", value_type="amount_eur", unit="per month",
    keywords=["company car"],
)


def test_four_car_policies_conflict_and_route_to_the_document_owner(make_client):
    result = login(make_client(), "lotte").post("/api/ask", json=CAR_QUESTION).json()

    assert result["topic"]["id"] == "mobility.car_lease_budget"
    answer = result["answer"]
    assert (answer["status"], answer["action"]) == ("conflict", "ask_expert")
    assert answer["headline"].startswith("Don't act yet")
    assert [(c["value_display"], c["best_grade"]) for c in answer["competing"]] == [
        ("€750 per month", "C"),
        ("€800 per month", "F"),
    ]

    sources = {s["id"]: s for s in result["sources"]}
    assert {i: s["status"] for i, s in sources.items()} == {
        "POL-BE-044": "effective",  # 2025 BE policy, owned by Sofie
        "FAQ-BE-012": "effective",  # onboarding FAQ, same €750
        "TEAMS-5127": "effective",  # colleague: €800 "since the town hall"
        "POL-BE-031": "superseded",  # 2023 BE policy
        "POL-NL-018": "not_applicable",  # Netherlands only
        "MEET-BE-0924": "not_applicable",  # rises to €800 only from 2027-01-01
    }
    assert sources["POL-BE-044"]["grade"] in ("B", "C")
    rank = GRADES.index
    assert rank(sources["POL-BE-044"]["grade"]) < rank(sources["TEAMS-5127"]["grade"])
    assert sources["POL-BE-031"]["grade"] == "F"
    assert sources["POL-NL-018"]["applicability"]["text"] == "Applies to Netherlands only"
    assert sources["MEET-BE-0924"]["kind_label"] == "Meeting transcript"
    assert sources["MEET-BE-0924"]["applicability"]["code"] == "not_yet_effective"

    top = result["experts"][0]
    assert (top["id"], top["name"]) == ("sofie", "Sofie Verhaegen")
    assert any("expertise" in r for r in top["reasons"])
    assert any(r.startswith("Owns") for r in top["reasons"])


def test_payroll_questions_still_match_their_topics(make_client):
    lotte = login(make_client(), "lotte")
    for question, topic_id in [
        ("What is the overtime cut-off?", "payroll.variables_cutoff"),
        ("Please tell me the deadline for variables", "payroll.variables_cutoff"),
        ("When must meal vouchers be ordered?", "payroll.meal_vouchers_order"),
        ("Wat is mijn leasebudget voor de bedrijfswagen?", "mobility.car_lease_budget"),
    ]:
        assert lotte.post("/api/ask", json={"question": question}).json()["topic"]["id"] == topic_id


@pytest.mark.parametrize(
    "question",
    [
        "How much does my colleague earn?",
        "What is Jonas's salary?",
        "Wat verdient mijn collega?",
        "Wat is het salaris van Pieter?",
        "Combien gagne mon collègue ?",
        "Is Jonas sick?",
        "Waarom is mijn collega ziek?",
        "What was in Ellen's performance review?",
        "What is the home address of Pieter?",
        "Where does Ellen live?",
    ],
)
def test_guard_refuses_another_persons_pay_and_private_data(make_client, question):
    result = login(make_client(), "lotte").post("/api/ask", json={"question": question}).json()
    assert result["topic"] is None
    assert "sources" not in result and "answer" not in result and "suggestions" not in result
    assert result["restricted"]["message"].startswith("TrustLabel doesn't share individual pay")
    assert result["restricted"]["contact"] == {"name": "Anke Claes", "title": "HR Policy Officer BE"}


@pytest.mark.parametrize(
    "question",
    [
        "What is the overtime cut-off?",
        "What is my company car lease budget?",
        "When must a sick certificate be submitted?",
        "My colleague is sick, when must she send the medical certificate?",
        "When do bonuses need to be submitted for the payroll run?",
        "How much do I earn?",
        "What is Sofie's email address?",
        "Wat zijn de lonen in de sector?",
    ],
)
def test_guard_lets_policy_questions_through(question):
    assert restricted(question, ["Sofie", "Sofie Verhaegen"]) is None


def test_guard_also_protects_the_teams_agent(make_client):
    app_client = make_client()
    token = connect(login(app_client, "lotte"))
    teams = TestClient(app_client.app)
    for tool in ("ask_trustlabel", "request_verification"):
        result = call(teams, token, tool, question="How much does my colleague earn?")
        assert result["isError"] is False
        assert result["structuredContent"]["topic"] is None
        assert "Anke Claes" in result["content"][0]["text"]
    normal = call(teams, token, "ask_trustlabel", question="What is the overtime cut-off?")
    assert normal["structuredContent"]["topic"]["id"] == "payroll.variables_cutoff"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("750", "750"), ("€750", "750"), ("€ 750", "750"), ("750 EUR", "750"), ("750,00", "750"), ("750.00", "750"),
     ("1", "1"), ("100000", "100000")],
)
def test_amount_eur_accepts_whole_euros(raw, expected):
    assert validate_value(CAR_TOPIC, raw) == expected


@pytest.mark.parametrize("raw", ["0", "100001", "750,50", "-750", "seven hundred", "", "$750"])
def test_amount_eur_rejects_out_of_range_and_cents(raw):
    with pytest.raises(ValueError):
        validate_value(CAR_TOPIC, raw)


def test_amount_eur_display_and_extraction():
    assert value_display(CAR_TOPIC, "750") == "€750 per month"
    assert value_display(CAR_TOPIC.model_copy(update={"unit": None}), "750") == "€750"
    text = "Since the town hall our car lease budget is €800 per month."
    claims = [
        ExtractedClaim(topic_id=CAR_TOPIC.id, value="800", quote="budget is €800 per month", valid_until=None),
        ExtractedClaim(topic_id=CAR_TOPIC.id, value="900", quote="the town hall", valid_until=None),
    ]
    valid = validate_extracted(claims, text, {CAR_TOPIC.id: CAR_TOPIC}, TODAY)
    assert [(c.value, c.value_display) for c in valid] == [("800", "€800 per month")]


@pytest.mark.parametrize(
    ("quote", "value", "states"),
    [
        ("goes up to eight hundred euros per month", "800", True),
        ("seven hundred and fifty euros", "750", True),
        ("seven hundred fifty euros", "750", True),
        ("twelve hundred euros", "1200", True),
        ("one thousand two hundred euros", "1200", True),
        ("a budget of €1.200 per month", "1200", True),
        ("twenty-five working days", "25", True),
        ("by the twentieth", "20", True),
        ("eight hundred euros", "750", False),
        ("seven hundred and fifty euros", "700", False),
    ],
)
def test_quotes_state_spelled_out_amounts(quote, value, states):
    assert quote_states_value(quote, value) is states
