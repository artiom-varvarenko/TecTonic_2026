"""Runtime settings, read from environment variables."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OPENAI_MODEL = "gpt-6-luna"
DEFAULT_STT_MODEL = "scribe_v2"


def credentials_path_from_env() -> Path:
    """TRUSTLABEL_CREDENTIALS_FILE, relative paths resolved against the repo root."""
    raw = os.environ.get("TRUSTLABEL_CREDENTIALS_FILE", "").strip()
    if not raw:
        return REPO_ROOT / ".credentials.json"
    path = Path(raw).expanduser()
    return path if path.is_absolute() else REPO_ROOT / path


def _optional(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


def parse_google_accounts(raw: str) -> dict[str, str]:
    """`email=user_id,email=user_id` → {lowercased email: user_id}."""
    accounts: dict[str, str] = {}
    for entry in raw.split(","):
        if not entry.strip():
            continue
        email, sep, user_id = entry.partition("=")
        email, user_id = email.strip().lower(), user_id.strip()
        if not sep or "@" not in email or not user_id:
            raise SystemExit("TRUSTLABEL_GOOGLE_ACCOUNTS must be comma-separated email=user_id pairs")
        accounts[email] = user_id
    return accounts


def public_url_from_env() -> str | None:
    raw = _optional("TRUSTLABEL_PUBLIC_URL")
    if raw is None:
        return None
    parts = urlsplit(raw)
    if parts.scheme not in {"http", "https"} or not parts.netloc or parts.query or parts.fragment:
        raise SystemExit("TRUSTLABEL_PUBLIC_URL must be an http(s) base URL, e.g. https://trustlabel.example.com")
    return raw.rstrip("/")


@dataclass(frozen=True)
class Settings:
    secret_key: str
    credentials_file: Path
    cookie_secure: bool = True
    openai_api_key: str | None = None
    openai_model: str = DEFAULT_OPENAI_MODEL
    elevenlabs_api_key: str | None = None
    elevenlabs_stt_model: str = DEFAULT_STT_MODEL
    data_dir: Path = REPO_ROOT / "data"
    google_client_id: str | None = None
    google_client_secret: str | None = None
    # Lowercased Google account email → TrustLabel user id.
    google_accounts: Mapping[str, str] = field(default_factory=dict)
    # Base for OAuth redirect URIs; None → the request's own base URL.
    public_url: str | None = None

    @classmethod
    def from_env(cls) -> Settings:
        secret_key = os.environ.get("TRUSTLABEL_SECRET_KEY", "").strip()
        if len(secret_key) < 32:
            raise SystemExit("TRUSTLABEL_SECRET_KEY must be set (min 32 characters)")
        return cls(
            secret_key=secret_key,
            credentials_file=credentials_path_from_env(),
            cookie_secure=os.environ.get("TRUSTLABEL_COOKIE_SECURE", "").strip() != "0",
            openai_api_key=_optional("OPENAI_API_KEY"),
            openai_model=_optional("OPENAI_MODEL") or DEFAULT_OPENAI_MODEL,
            elevenlabs_api_key=_optional("ELEVENLABS_API_KEY"),
            elevenlabs_stt_model=_optional("ELEVENLABS_STT_MODEL") or DEFAULT_STT_MODEL,
            google_client_id=_optional("GOOGLE_CLIENT_ID"),
            google_client_secret=_optional("GOOGLE_CLIENT_SECRET"),
            google_accounts=parse_google_accounts(os.environ.get("TRUSTLABEL_GOOGLE_ACCOUNTS", "")),
            public_url=public_url_from_env(),
        )
