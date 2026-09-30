"""Sign in with Google (OpenID Connect authorization code flow with PKCE).

Google only proves an identity; the allowlist in TRUSTLABEL_GOOGLE_ACCOUNTS decides which
TrustLabel person that identity may act as. Nothing from the provider is ever reflected to the user.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from collections.abc import Mapping
from typing import Protocol
from urllib.parse import urlencode

import httpx
from itsdangerous import BadSignature, URLSafeTimedSerializer

from .config import Settings
from .models import Person

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})
SCOPE = "openid email profile"
CALLBACK_PATH = "/api/auth/google/callback"
FLOW_COOKIE = "trustlabel_oauth"
FLOW_COOKIE_PATH = "/api/auth/google"
FLOW_MAX_AGE_SECONDS = 600
FLOW_SALT = "trustlabel.google-oauth-flow"
TOKEN_TIMEOUT_SECONDS = 10

CANCELLED = "google_cancelled"
FAILED = "google_failed"
UNLINKED = "google_unlinked"


class GoogleAuthError(Exception):
    """A failed sign-in; `code` is the only thing shown to the user (as ?login_error=)."""

    def __init__(self, code: str, reason: str) -> None:
        super().__init__(reason)
        self.code = code
        self.reason = reason


class TokenExchange(Protocol):
    def __call__(self, *, code: str, code_verifier: str, redirect_uri: str) -> dict: ...


def google_enabled(settings: Settings) -> bool:
    return bool(settings.google_client_id and settings.google_client_secret and settings.google_accounts)


def check_accounts(accounts: Mapping[str, str], people: Mapping[str, Person]) -> None:
    """Fail at startup if the allowlist maps an email to anyone who cannot log in."""
    for user_id in accounts.values():
        person = people.get(user_id)
        if person is None or not person.active:
            raise SystemExit(f"TRUSTLABEL_GOOGLE_ACCOUNTS maps to an unknown or inactive user: {user_id}")


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def new_flow() -> dict[str, str]:
    return {
        "state": secrets.token_urlsafe(32),
        "nonce": secrets.token_urlsafe(32),
        "code_verifier": secrets.token_urlsafe(64),
    }


def code_challenge(code_verifier: str) -> str:
    return _b64url(hashlib.sha256(code_verifier.encode("ascii")).digest())


def _serializer(secret_key: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(secret_key, salt=FLOW_SALT)


def sign_flow(secret_key: str, flow: dict[str, str]) -> str:
    return _serializer(secret_key).dumps(flow)


def load_flow(secret_key: str, value: str | None) -> dict[str, str]:
    """Verify the signed flow cookie; expired, tampered or missing → GoogleAuthError."""
    if not value:
        raise GoogleAuthError(FAILED, "missing flow cookie")
    try:
        flow = _serializer(secret_key).loads(value, max_age=FLOW_MAX_AGE_SECONDS)
    except BadSignature as exc:  # SignatureExpired is a subclass
        raise GoogleAuthError(FAILED, "invalid or expired flow cookie") from exc
    if not isinstance(flow, dict) or not all(
        isinstance(flow.get(k), str) and flow[k] for k in ("state", "nonce", "code_verifier")
    ):
        raise GoogleAuthError(FAILED, "malformed flow cookie")
    return flow


def check_state(flow: dict[str, str], state: str | None) -> None:
    if not state or not hmac.compare_digest(flow["state"].encode(), state.encode()):
        raise GoogleAuthError(FAILED, "state mismatch")


def authorization_url(client_id: str, redirect_uri: str, flow: dict[str, str]) -> str:
    params = {
        "client_id": client_id,
        "response_type": "code",
        "scope": SCOPE,
        "redirect_uri": redirect_uri,
        "state": flow["state"],
        "nonce": flow["nonce"],
        "code_challenge": code_challenge(flow["code_verifier"]),
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def http_token_exchange(client_id: str, client_secret: str) -> TokenExchange:
    """The real code-for-token exchange, a direct TLS call to Google's token endpoint."""

    def exchange(*, code: str, code_verifier: str, redirect_uri: str) -> dict:
        response = httpx.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
            },
            headers={"Accept": "application/json"},
            timeout=TOKEN_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()

    return exchange


def decode_id_token(id_token: object) -> dict:
    """Payload of an ID token received directly from Google's token endpoint over TLS.

    Per OpenID Connect Core 3.1.3.7, the TLS server validation of that direct response may be
    used instead of checking the token signature; the claims are still validated below.
    """
    if not isinstance(id_token, str) or id_token.count(".") != 2:
        raise GoogleAuthError(FAILED, "malformed id_token")
    payload = id_token.split(".")[1]
    try:
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (ValueError, TypeError) as exc:
        raise GoogleAuthError(FAILED, "undecodable id_token") from exc
    if not isinstance(claims, dict):
        raise GoogleAuthError(FAILED, "malformed id_token payload")
    return claims


def verified_email(claims: dict, *, client_id: str, nonce: str, now: float) -> str:
    """Validate the ID token claims and return the lowercased, Google-verified email."""
    if claims.get("iss") not in ISSUERS:
        raise GoogleAuthError(FAILED, "wrong issuer")
    if claims.get("aud") != client_id:
        raise GoogleAuthError(FAILED, "wrong audience")
    exp = claims.get("exp")
    if isinstance(exp, bool) or not isinstance(exp, (int, float)) or exp <= now:
        raise GoogleAuthError(FAILED, "expired id_token")
    token_nonce = claims.get("nonce")
    if not isinstance(token_nonce, str) or not hmac.compare_digest(token_nonce.encode(), nonce.encode()):
        raise GoogleAuthError(FAILED, "nonce mismatch")
    if claims.get("email_verified") is not True:
        raise GoogleAuthError(FAILED, "email not verified")
    email = claims.get("email")
    if not isinstance(email, str) or "@" not in email:
        raise GoogleAuthError(FAILED, "no email claim")
    return email.strip().lower()
