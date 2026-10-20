import httpx
import pytest
from test_channels import CUTOFF, brief, pane

from trustlabel.teams_alerts import check_workflow_url

ELLEN_TEAMS = "ellen.maes@sdworx.example"
REQUEST = {"topic_id": "payroll.variables_cutoff", "client_id": "vandam", "question": CUTOFF}


class StubTeams:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.payloads: list[dict] = []

    def send(self, payload: dict) -> None:
        self.payloads.append(payload)
        if self.fail:
            raise httpx.ConnectError("workflow unreachable")


def settle(app_client) -> None:
    """Wait for the background alert sends."""
    app_client.app.state.alert_pool.shutdown(wait=True)


def test_a_new_request_reaches_the_routed_expert_in_teams_once(make_client):
    teams = StubTeams()
    app_client = make_client(
        teams_alerts=teams, teams_users={"ellen": ELLEN_TEAMS}, public_url="https://trustlabel.example.com"
    )
    outlook = pane(app_client)
    expert = brief(outlook, subject="Van Dam", body=CUTOFF)["expert"]
    assert outlook.post("/api/v1/verifications", json=REQUEST).status_code == 201
    assert outlook.post("/api/v1/verifications", json=REQUEST).status_code == 200  # same open request
    settle(app_client)

    [payload] = teams.payloads
    assert payload["recipient"] == ELLEN_TEAMS
    [attachment] = payload["attachments"]
    assert attachment["contentType"] == "application/vnd.microsoft.card.adaptive"
    card = attachment["content"]
    assert card["msteams"]["entities"][0]["mentioned"] == {"id": ELLEN_TEAMS, "name": "Ellen Maes"}
    ask = card["body"][1]["text"]
    assert ask.startswith("<at>Ellen Maes</at>, Lotte Janssens asks you to verify the payroll variables cut-off")
    assert ask.endswith("for Van Dam Logistics NV (BE).")
    facts = {f["title"]: f["value"] for f in card["body"][2]["facts"]}
    # The expert gets the drafted question (template without a Claude key) naming both competing values.
    assert facts["Question"].startswith("Which is right for Van Dam Logistics NV (BE): payroll variables cut-off ")
    assert "20th of the month (" in facts["Question"] and "25th of the month (" in facts["Question"]
    # Both competing values, each once, so the expert sees the conflict before opening TrustLabel.
    assert facts["Sources say"].count("20th of the month") == 1 and "25th of the month" in facts["Sources say"]
    # Same routing and reasons the requester saw.
    assert expert["name"] == "Ellen Maes" and facts["Why you"] == "; ".join(expert["reasons"])
    assert card["actions"] == [
        {"type": "Action.OpenUrl", "title": "Answer in TrustLabel", "url": "https://trustlabel.example.com/?view=inbox"}
    ]


def test_an_unmapped_expert_or_a_failing_workflow_never_blocks_the_request(make_client, caplog):
    teams = StubTeams(fail=True)
    app_client = make_client(teams_alerts=teams)
    created = pane(app_client).post("/api/v1/verifications", json=REQUEST)
    assert created.status_code == 201
    settle(app_client)

    [payload] = teams.payloads
    card = payload["attachments"][0]["content"]
    assert payload["recipient"] is None and "msteams" not in card and "actions" not in card
    assert card["body"][1]["text"].startswith("Ellen Maes, Lotte Janssens asks you")
    assert f"Teams alert for {created.json()['id']} failed: ConnectError" in caplog.text


def test_only_https_teams_workflow_hosts_are_accepted():
    for url in (
        "https://prod-12.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x",
        "https://default0a1b.2c.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/abc?sig=x",
    ):
        assert check_workflow_url(url) == url
    for url in (
        "http://prod-12.westeurope.logic.azure.com/workflows/abc",
        "https://logic.azure.com.attacker.example/workflows/abc",
        "https://user@prod-12.westeurope.logic.azure.com/workflows/abc",
        "https://prod-12.westeurope.logic.azure.com:8443/workflows/abc",
        "https://hooks.example.com/workflows/abc",
    ):
        with pytest.raises(ValueError):
            check_workflow_url(url)
