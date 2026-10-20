"""Runtime settings, read from environment variables."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from .salesforce import check_domain
from .spott import webhook_key
from .teams_alerts import check_workflow_url
from .teams_graph import ChannelRef, check_tenant, parse_sync_channels

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OPENAI_MODEL = "gpt-6-luna"
DEFAULT_STT_MODEL = "scribe_v2"
# Short, single-question drafting: the fast Claude tier (id from Anthropic's models overview).
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5"
# ElevenLabs premade voice "Matilda" (professional, clear); checked live against GET /v2/voices.
DEFAULT_VOICE_ID = "XrExE9yKIg1WjnnlVkGX"


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


def parse_teams_users(raw: str) -> dict[str, str]:
    """`user_id=name@company.com,…` → {user id: lowercased Teams sign-in address}."""
    users: dict[str, str] = {}
    for entry in raw.split(","):
        if not entry.strip():
            continue
        user_id, sep, address = entry.partition("=")
        user_id, address = user_id.strip().lower(), address.strip().lower()
        local, at, domain = address.partition("@")
        if not sep or not user_id or not at or not local or "." not in domain or " " in address:
            raise SystemExit("TRUSTLABEL_TEAMS_USERS must be comma-separated user_id=name@company.com pairs")
        users[user_id] = address
    return users


def teams_workflow_url_from_env() -> str | None:
    raw = _optional("TEAMS_WORKFLOW_URL")
    if raw is None:
        return None
    try:
        return check_workflow_url(raw)
    except ValueError:
        raise SystemExit("TEAMS_WORKFLOW_URL must be the https URL of a Teams workflow webhook trigger") from None


def public_url_from_env() -> str | None:
    raw = _optional("TRUSTLABEL_PUBLIC_URL")
    if raw is None:
        return None
    parts = urlsplit(raw)
    if parts.scheme not in {"http", "https"} or not parts.netloc or parts.query or parts.fragment:
        raise SystemExit("TRUSTLABEL_PUBLIC_URL must be an http(s) base URL, e.g. https://trustlabel.example.com")
    return raw.rstrip("/")


def salesforce_from_env() -> tuple[str | None, str | None, str | None]:
    """(My Domain host, client id, client secret): all three or none."""
    values = (_optional("SALESFORCE_DOMAIN"), _optional("SALESFORCE_CLIENT_ID"), _optional("SALESFORCE_CLIENT_SECRET"))
    if not any(values):
        return None, None, None
    if not all(values):
        raise SystemExit("Set SALESFORCE_DOMAIN, SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET together")
    try:
        domain = check_domain(values[0])
    except ValueError:
        raise SystemExit("SALESFORCE_DOMAIN must be the org's My Domain host, e.g. acme.my.salesforce.com") from None
    return domain, values[1], values[2]


def ms_graph_from_env() -> dict[str, object]:
    """Microsoft Graph app registration (tenant, client id, secret: all three or none) and channels to sync."""
    values = (_optional("MS_TENANT_ID"), _optional("MS_CLIENT_ID"), _optional("MS_CLIENT_SECRET"))
    raw_channels = _optional("TEAMS_SYNC_CHANNELS")
    if not any(values):
        if raw_channels:
            raise SystemExit("TEAMS_SYNC_CHANNELS needs MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET")
        return {}
    if not all(values):
        raise SystemExit("Set MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET together")
    try:
        tenant = check_tenant(values[0])
        channels = parse_sync_channels(raw_channels or "")
    except ValueError:
        raise SystemExit(
            "MS_TENANT_ID must be a tenant id or domain; TEAMS_SYNC_CHANNELS must be teamId/channelId,…"
        ) from None
    return {
        "ms_tenant_id": tenant,
        "ms_client_id": values[1],
        "ms_client_secret": values[2],
        "teams_sync_channels": channels,
    }


def meetings_from_env() -> dict[str, object]:
    """Folder of meeting recordings to watch (e.g. synced Teams recordings) and the user who owns them."""
    raw_dir, owner = _optional("TRUSTLABEL_MEETINGS_DIR"), _optional("TRUSTLABEL_MEETINGS_OWNER")
    if raw_dir is None:
        if owner:
            raise SystemExit("TRUSTLABEL_MEETINGS_OWNER needs TRUSTLABEL_MEETINGS_DIR")
        return {}
    folder = Path(raw_dir).expanduser()
    if not folder.is_absolute():
        folder = REPO_ROOT / folder
    if not folder.is_dir():
        raise SystemExit("TRUSTLABEL_MEETINGS_DIR must be an existing directory")
    if not owner:
        raise SystemExit("TRUSTLABEL_MEETINGS_OWNER must name the TrustLabel user who owns folder recordings")
    return {"meetings_dir": folder, "meetings_owner": owner.lower()}


@dataclass(frozen=True)
class Settings:
    secret_key: str
    credentials_file: Path
    cookie_secure: bool = True
    openai_api_key: str | None = None
    openai_model: str = DEFAULT_OPENAI_MODEL
    elevenlabs_api_key: str | None = None
    elevenlabs_stt_model: str = DEFAULT_STT_MODEL
    elevenlabs_voice_id: str = DEFAULT_VOICE_ID
    data_dir: Path = REPO_ROOT / "data"
    google_client_id: str | None = None
    google_client_secret: str | None = None
    # Lowercased Google account email → TrustLabel user id.
    google_accounts: Mapping[str, str] = field(default_factory=dict)
    # Base for OAuth redirect URIs; None → the request's own base URL.
    public_url: str | None = None
    # Spott (recruitment CRM): the API key writes verified answers back; the webhook secret enables note capture.
    spott_api_key: str | None = None
    spott_webhook_secret: str | None = None
    # Salesforce Service Cloud: External Client App (client credentials flow) whose new cases TrustLabel briefs.
    salesforce_domain: str | None = None
    salesforce_client_id: str | None = None
    salesforce_client_secret: str | None = None
    # TrustLabel user ids that may connect shared workspaces (e.g. Spott) from the Integrations page.
    admins: frozenset[str] = frozenset()
    # Teams workflow webhook that delivers verification requests to the routed expert (secret: signed URL).
    teams_workflow_url: str | None = None
    # TrustLabel user id → Teams sign-in address, so the alert @mentions (or messages) the right person.
    teams_users: Mapping[str, str] = field(default_factory=dict)
    # Claude drafts the question sent to the expert; without a key a deterministic template is used.
    anthropic_api_key: str | None = None
    anthropic_model: str = DEFAULT_ANTHROPIC_MODEL
    # Microsoft Graph app-only access (client credentials) for Teams channel sync, and the channels it reads.
    ms_tenant_id: str | None = None
    ms_client_id: str | None = None
    ms_client_secret: str | None = None
    teams_sync_channels: tuple[ChannelRef, ...] = ()
    # Watched folder of meeting recordings and the TrustLabel user id that owns the items they become.
    meetings_dir: Path | None = None
    meetings_owner: str | None = None

    @classmethod
    def from_env(cls) -> Settings:
        secret_key = os.environ.get("TRUSTLABEL_SECRET_KEY", "").strip()
        if len(secret_key) < 32:
            raise SystemExit("TRUSTLABEL_SECRET_KEY must be set (min 32 characters)")
        spott_webhook_secret = _optional("SPOTT_WEBHOOK_SECRET")
        if spott_webhook_secret is not None:
            try:
                webhook_key(spott_webhook_secret)
            except ValueError:
                raise SystemExit(
                    "SPOTT_WEBHOOK_SECRET must be the whsec_… signing secret from Spott → Settings → Webhooks"
                ) from None
        salesforce_domain, salesforce_client_id, salesforce_client_secret = salesforce_from_env()
        return cls(
            secret_key=secret_key,
            credentials_file=credentials_path_from_env(),
            cookie_secure=os.environ.get("TRUSTLABEL_COOKIE_SECURE", "").strip() != "0",
            openai_api_key=_optional("OPENAI_API_KEY"),
            openai_model=_optional("OPENAI_MODEL") or DEFAULT_OPENAI_MODEL,
            elevenlabs_api_key=_optional("ELEVENLABS_API_KEY"),
            elevenlabs_stt_model=_optional("ELEVENLABS_STT_MODEL") or DEFAULT_STT_MODEL,
            elevenlabs_voice_id=_optional("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE_ID,
            google_client_id=_optional("GOOGLE_CLIENT_ID"),
            google_client_secret=_optional("GOOGLE_CLIENT_SECRET"),
            google_accounts=parse_google_accounts(os.environ.get("TRUSTLABEL_GOOGLE_ACCOUNTS", "")),
            public_url=public_url_from_env(),
            spott_api_key=_optional("SPOTT_API_KEY"),
            spott_webhook_secret=spott_webhook_secret,
            salesforce_domain=salesforce_domain,
            salesforce_client_id=salesforce_client_id,
            salesforce_client_secret=salesforce_client_secret,
            admins=frozenset(
                a.strip().lower() for a in os.environ.get("TRUSTLABEL_ADMINS", "").split(",") if a.strip()
            ),
            teams_workflow_url=teams_workflow_url_from_env(),
            teams_users=parse_teams_users(os.environ.get("TRUSTLABEL_TEAMS_USERS", "")),
            anthropic_api_key=_optional("ANTHROPIC_API_KEY"),
            anthropic_model=_optional("ANTHROPIC_MODEL") or DEFAULT_ANTHROPIC_MODEL,
            **ms_graph_from_env(),
            **meetings_from_env(),
        )
