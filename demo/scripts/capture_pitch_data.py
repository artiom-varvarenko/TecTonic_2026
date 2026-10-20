"""Snapshot the real TrustLabel answers for the one-minute pitch video into demo/src/data/pitch-data.json.

The "four car policies" case from the seed data, as an employee meets it on 2026-10-20: Lotte asks for her company
car lease budget, TrustLabel says "Don't act yet" and asks the policy owner (Sofie) itself, Sofie answers in Teams,
and Lotte's next ask is a verified grade-A answer. Also the Teams cards both ways and the refusal for a colleague's
pay. No AI service is called.

    uv run python demo/scripts/capture_pitch_data.py
"""

import json
import secrets
import sys
import tempfile
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from trustlabel.app import create_app  # noqa: E402
from trustlabel.config import Settings  # noqa: E402
from trustlabel.credentials import hash_password  # noqa: E402
from trustlabel.teams_alerts import request_card, request_code, resolved_card  # noqa: E402

TODAY = date(2026, 10, 20)
QUESTION = "What is my company car lease budget?"
PAY_QUESTION = "How much does my colleague Jonas earn?"
# Sofie's answer: €750 holds until the town-hall raise to €800 takes effect on 1 January 2027.
RESOLUTION = {"value": "750", "note": "€800 starts 1 January 2027", "valid_until": "2026-12-31"}
OUT = ROOT / "demo" / "src" / "data" / "pitch-data.json"


def main() -> None:
    people = json.loads((ROOT / "data" / "people.json").read_text(encoding="utf-8"))
    passwords = {p["id"]: secrets.token_urlsafe(12) for p in people if p["active"]}
    with tempfile.TemporaryDirectory() as tmp:
        creds = Path(tmp) / "credentials.json"
        creds.write_text(json.dumps({u: hash_password(pw) for u, pw in passwords.items()}), encoding="utf-8")
        settings = Settings(secret_key=secrets.token_hex(32), credentials_file=creds, cookie_secure=False)
        app = create_app(settings, clock=lambda: TODAY)

        def login(user: str) -> TestClient:
            client = TestClient(app)
            response = client.post("/api/login", json={"username": user, "password": passwords[user]})
            response.raise_for_status()
            return client

        lotte, sofie = login("lotte"), login("sofie")

        def ask(question: str, auto_ask: bool = False) -> dict:
            response = lotte.post("/api/ask", json={"question": question, "auto_ask": auto_ask})
            response.raise_for_status()
            return response.json()

        before = ask(QUESTION, auto_ask=True)
        request = before["auto_request"]
        expert = before["experts"][0]
        card = request_card(
            expert_name=request["assignee_name"],
            expert_address="sofie@sdworx.example",
            requester_name=request["requester_name"],
            topic_label=request["topic"]["label"],
            context_label=request["context_label"],
            question=request["question"],
            candidates=[(c["value_display"], c["best_grade"]) for c in before["answer"]["competing"]],
            reasons=expert["reasons"],
            open_url=None,
            reply_code=request_code(request["id"]),
        )
        resolved = sofie.post(f"/api/verifications/{request['id']}/resolve", json=RESOLUTION)
        resolved.raise_for_status()
        after = ask(QUESTION)
        done, _ = resolved_card(
            people=[(request["requester_name"], "lotte@sdworx.example")],
            expert_name=request["assignee_name"],
            topic_label=request["topic"]["label"],
            context_label=request["context_label"],
            value_display=after["answer"]["value_display"],
            grade=after["answer"]["grade"],
            note=RESOLUTION["note"],
            open_url=None,
        )
        data = {
            "today": TODAY.isoformat(),
            "question": QUESTION,
            "before": before,
            "request_card": card,
            "reply": f"@TrustLabel {request_code(request['id'])} 750 {RESOLUTION['note']}",
            "resolution": RESOLUTION,
            "resolved_card": done,
            "after": after,
            "pay_question": PAY_QUESTION,
            "pay": ask(PAY_QUESTION),
        }
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
