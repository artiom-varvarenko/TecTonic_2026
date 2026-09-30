"""Snapshot the real TrustLabel API responses along the demo path into demo/src/data/demo-data.json.

The video never invents grades: every number, reason and expert ranking on screen comes from this
file, produced by the actual engine on 2026-09-30. Voice/OpenAI calls are stubbed (same as the tests).

    uv run python demo/scripts/capture_demo_data.py
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

from trustlabel.ai import ExtractedClaim  # noqa: E402
from trustlabel.app import create_app  # noqa: E402
from trustlabel.config import Settings  # noqa: E402
from trustlabel.credentials import hash_password  # noqa: E402

TODAY = date(2026, 9, 30)
CUTOFF = "payroll.variables_cutoff"
QUESTION = "What's the cut-off for submitting overtime this month?"
TRANSCRIPT = "Yes, Van Dam Logistics really has the 25th as cut-off, valid until 31 March 2027."
OUT = ROOT / "demo" / "src" / "data" / "demo-data.json"


class StubTranscriber:
    def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        return TRANSCRIPT


class StubExtractor:
    def extract(self, text, topics, today):
        return [ExtractedClaim(topic_id=CUTOFF, value="25", quote="the 25th as cut-off", valid_until="2027-03-31")]


def main() -> None:
    people = json.loads((ROOT / "data" / "people.json").read_text(encoding="utf-8"))
    passwords = {p["id"]: secrets.token_urlsafe(12) for p in people if p["active"]}
    with tempfile.TemporaryDirectory() as tmp:
        creds = Path(tmp) / "credentials.json"
        creds.write_text(json.dumps({u: hash_password(pw) for u, pw in passwords.items()}), encoding="utf-8")
        settings = Settings(secret_key=secrets.token_hex(32), credentials_file=creds, cookie_secure=False)
        app = create_app(settings, StubExtractor(), StubTranscriber(), clock=lambda: TODAY)

        def login(user: str) -> TestClient:
            client = TestClient(app)
            response = client.post("/api/login", json={"username": user, "password": passwords[user]})
            response.raise_for_status()
            return client

        lotte, ellen = login("lotte"), login("ellen")

        def ask(client_id):
            response = lotte.post("/api/ask", json={"question": QUESTION, "client_id": client_id})
            response.raise_for_status()
            return response.json()

        before = ask("vandam")
        general_before = ask(None)
        request = lotte.post(
            "/api/verifications", json={"topic_id": CUTOFF, "client_id": "vandam", "question": QUESTION}
        )
        request.raise_for_status()
        inbox = ellen.get("/api/verifications").json()["items"]
        voice = ellen.post(
            f"/api/verifications/{request.json()['id']}/voice",
            files={"audio": ("answer.webm", b"voice-bytes", "audio/webm")},
        )
        voice.raise_for_status()
        suggestion = voice.json()["suggestion"]
        resolved = ellen.post(
            f"/api/verifications/{request.json()['id']}/resolve",
            json={"value": suggestion["value"], "valid_until": suggestion["valid_until"]},
        )
        resolved.raise_for_status()
        after = ask("vandam")
        general_after = ask(None)

    snapshot = {
        "today": TODAY.isoformat(),
        "question": QUESTION,
        "before": before,
        "general_before": general_before,
        "request": request.json(),
        "inbox": inbox,
        "voice": voice.json(),
        "resolved": resolved.json(),
        "after": after,
        "general_after": general_after,
    }
    for volatile in ("id", "created_at"):
        snapshot["request"].pop(volatile, None)
        snapshot["resolved"].pop(volatile, None)
        for item in snapshot["inbox"]:
            item.pop(volatile, None)
    snapshot["resolved"]["resolution"]["resolved_at"] = f"{TODAY.isoformat()}T10:42:00+02:00"
    text = json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n"
    # Stable ids so re-running the script only changes the file when the engine's output changes.
    text = text.replace(snapshot["resolved"]["resolution"]["item_id"], "VER-3F9A2C71")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
