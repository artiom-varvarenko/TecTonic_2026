"""Runtime settings, read from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

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
        )
