import json
import secrets
from datetime import date

import pytest
from fastapi.testclient import TestClient

from trustlabel.app import create_app
from trustlabel.config import REPO_ROOT, Settings
from trustlabel.credentials import hash_password
from trustlabel.store import Store

TODAY = date(2026, 9, 30)
DATA_DIR = REPO_ROOT / "data"
# Random per test run: no fixed credentials anywhere in the repo, not even for tests.
_PASSWORDS = {
    p["id"]: secrets.token_urlsafe(12)
    for p in json.loads((DATA_DIR / "people.json").read_text(encoding="utf-8"))
    if p["active"]
}
_SECRET_KEY = secrets.token_hex(32)


def password_for(username: str) -> str:
    return _PASSWORDS[username]


@pytest.fixture
def store() -> Store:
    return Store(DATA_DIR)


@pytest.fixture(scope="session")
def creds_file(tmp_path_factory):
    path = tmp_path_factory.mktemp("creds") / "credentials.json"
    path.write_text(
        json.dumps({user_id: hash_password(pw) for user_id, pw in _PASSWORDS.items()}),
        encoding="utf-8",
    )
    return path


@pytest.fixture
def make_client(creds_file):
    def factory(
        extractor=None,
        transcriber=None,
        *,
        google_exchange=None,
        spott=None,
        spott_factory=None,
        salesforce=None,
        teams_alerts=None,
        speaker=None,
        graph=None,
        claude=None,
        meeting_transcriber=None,
        monotonic=None,
        **settings_overrides,
    ) -> TestClient:
        settings = Settings(
            secret_key=_SECRET_KEY, credentials_file=creds_file, cookie_secure=False, **settings_overrides
        )
        extra = {"spott_factory": spott_factory} if spott_factory else {}
        if monotonic is not None:
            extra["monotonic"] = monotonic
        app = create_app(
            settings,
            extractor,
            transcriber,
            clock=lambda: TODAY,
            google_exchange=google_exchange,
            spott=spott,
            salesforce=salesforce,
            teams_alerts=teams_alerts,
            speaker=speaker,
            graph=graph,
            claude=claude,
            meeting_transcriber=meeting_transcriber,
            **extra,
        )
        return TestClient(app)

    return factory


def login(client: TestClient, username: str) -> TestClient:
    """Log `username` in on a fresh cookie jar that talks to the same app."""
    user_client = TestClient(client.app)
    response = user_client.post(
        "/api/login", json={"username": username, "password": password_for(username)}
    )
    assert response.status_code == 200, response.text
    return user_client
