"""Snapshot the real TrustLabel API responses along the demo path into demo/src/data/demo-data.json.

The video never invents grades: every number, reason and expert ranking on screen comes from this
file, produced by the actual engine on 2026-09-30: the ask answers, the trust overview before and
after Ellen's verification, and the MCP server's replies to a Teams agent. OpenAI is stubbed (same as
the tests); the transcript is what ElevenLabs Scribe made of Ellen's voice note in the video.

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
# ElevenLabs Scribe's transcript of Ellen's voice note as heard in the video (script.json, voice part 2).
TRANSCRIPT = "Yes, Van Damme Logistics really has the 25th as cutoff, valid until March 31st, 2027"
QUOTE = "the 25th as cutoff"
TEAMS_QUESTION = "What's the overtime cut-off for Van Dam this month?"
OUT = ROOT / "demo" / "src" / "data" / "demo-data.json"


class StubTranscriber:
    def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        return TRANSCRIPT


class StubExtractor:
    def extract(self, text, topics, today):
        return [ExtractedClaim(topic_id=CUTOFF, value="25", quote=QUOTE, valid_until="2027-03-31")]


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

        def overview():
            response = lotte.get("/api/overview", params={"client_id": "vandam"})
            response.raise_for_status()
            return response.json()

        # Microsoft Teams: a Copilot Studio agent calls the MCP server with Lotte's connection key.
        key = lotte.post("/api/connections/teams")
        key.raise_for_status()
        teams = TestClient(app, headers={"X-API-Key": key.json()["token"]})

        def rpc(method: str, params: dict | None = None) -> dict:
            response = teams.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})
            response.raise_for_status()
            return response.json()["result"]

        def ask_in_teams() -> dict:
            result = rpc("tools/call", {"name": "ask_trustlabel", "arguments": {"question": TEAMS_QUESTION, "client": "Van Dam"}})
            return {"text": result["content"][0]["text"], "result": result["structuredContent"]}

        me = lotte.get("/api/me").json()
        initialize = rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "demo", "version": "1"}})
        tools = rpc("tools/list")["tools"]
        overview_before = overview()
        teams_before = ask_in_teams()
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
        overview_after = overview()
        teams_after = ask_in_teams()

    for board in (overview_before, overview_after):
        for event in board["activity"]:
            event["at"] = f"{TODAY.isoformat()}T10:42:00+02:00"  # wall-clock time, not engine output
    snapshot = {
        "today": TODAY.isoformat(),
        "question": QUESTION,
        "me": {"user": me["user"], "contexts": me["contexts"]},
        "overview_before": overview_before,
        "overview_after": overview_after,
        "mcp": {
            "server": initialize["serverInfo"],
            "protocol": initialize["protocolVersion"],
            "tools": [{"name": t["name"], "title": t["title"]} for t in tools],
            "question": TEAMS_QUESTION,
            "before": teams_before,
            "after": teams_after,
        },
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
