import base64
import hashlib
import json
import time
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

CLIENT_ID = "test-client.apps.googleusercontent.com"
GOOGLE = {
    "google_client_id": CLIENT_ID,
    "google_client_secret": "test-secret",
    "google_accounts": {"Lotte@Example.com": "lotte"},
}


def _b64(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()


def id_token(**claims) -> str:
    return f"{_b64({'alg': 'RS256'})}.{_b64(claims)}.c2ln"


def start(client) -> dict[str, str]:
    response = client.get("/api/auth/google/start", follow_redirects=False)
    assert response.status_code == 302
    return {k: v[0] for k, v in parse_qs(urlsplit(response.headers["location"]).query).items()}


def google_client(make_client, claims=None, *, fail=False, **overrides):
    """App with Google enabled; the stubbed token endpoint returns an ID token for the started flow."""
    flow: dict[str, str] = {}

    def exchange(*, code, code_verifier, redirect_uri):
        assert code == "auth-code"
        assert redirect_uri == "http://testserver/api/auth/google/callback"
        challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest()).rstrip(b"=")
        assert challenge.decode() == flow["code_challenge"]
        if fail:
            raise httpx.ConnectError("boom")
        token = {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "exp": int(time.time()) + 300,
            "nonce": flow["nonce"],
            "email": "lotte@example.com",
            "email_verified": True,
        }
        token.update(claims or {})
        return {"access_token": "at", "id_token": id_token(**token)}

    client = make_client(google_exchange=exchange, **{**GOOGLE, **overrides})
    return client, flow, exchange


def callback(client, **params):
    return client.get("/api/auth/google/callback", params=params, follow_redirects=False)


def test_disabled_by_default(make_client):
    client = make_client()
    assert client.get("/api/auth/providers").json() == {"google": False}
    assert client.get("/api/auth/google/start", follow_redirects=False).status_code == 404


def test_start_redirects_with_pkce_and_sets_lax_flow_cookie(make_client):
    client, _, _ = google_client(make_client)
    assert client.get("/api/auth/providers").json() == {"google": True}
    response = client.get("/api/auth/google/start", follow_redirects=False)
    assert response.status_code == 302
    location = urlsplit(response.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == "https://accounts.google.com/o/oauth2/v2/auth"
    params = {k: v[0] for k, v in parse_qs(location.query).items()}
    assert params["client_id"] == CLIENT_ID
    assert params["response_type"] == "code"
    assert params["scope"] == "openid email profile"
    assert params["redirect_uri"] == "http://testserver/api/auth/google/callback"
    assert params["code_challenge_method"] == "S256"
    assert params["prompt"] == "select_account"
    assert params["state"] and params["nonce"] and params["code_challenge"]
    cookie = response.headers["set-cookie"].lower()
    assert cookie.startswith("trustlabel_oauth=")
    for attribute in ("httponly", "samesite=lax", "path=/api/auth/google", "max-age=600"):
        assert attribute in cookie
    assert "secure" not in cookie.replace("samesite", "")  # cookie_secure=False in tests


def test_public_url_sets_redirect_uri(make_client):
    client = make_client(google_exchange=lambda **_: {}, public_url="https://trustlabel.example.com", **GOOGLE)
    response = client.get("/api/auth/google/start", follow_redirects=False)
    params = parse_qs(urlsplit(response.headers["location"]).query)
    assert params["redirect_uri"] == ["https://trustlabel.example.com/api/auth/google/callback"]


def test_callback_logs_in_mapped_user(make_client):
    client, flow, _ = google_client(make_client)
    flow.update(start(client))
    response = callback(client, code="auth-code", state=flow["state"])
    assert response.status_code == 303
    assert response.headers["location"] == "/"
    assert "trustlabel_oauth" not in client.cookies
    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json()["user"]["id"] == "lotte"


@pytest.mark.parametrize("tamper", ["wrong_state", "missing_state", "missing_cookie"])
def test_callback_rejects_bad_state(make_client, tamper):
    client, flow, _ = google_client(make_client)
    flow.update(start(client))
    params = {"code": "auth-code", "state": flow["state"]}
    if tamper == "wrong_state":
        params["state"] = flow["state"][:-2] + "xx"
    elif tamper == "missing_state":
        del params["state"]
    else:
        client.cookies.clear()
    response = callback(client, **params)
    assert response.headers["location"] == "/?login_error=google_failed"
    assert client.get("/api/me").status_code == 401


def test_callback_rejects_unlinked_account(make_client):
    client, flow, _ = google_client(make_client, {"email": "stranger@example.com"})
    flow.update(start(client))
    response = callback(client, code="auth-code", state=flow["state"])
    assert response.headers["location"] == "/?login_error=google_unlinked"
    assert client.get("/api/me").status_code == 401


@pytest.mark.parametrize(
    "claims",
    [
        {"email_verified": False},
        {"aud": "someone-else.apps.googleusercontent.com"},
        {"nonce": "replayed-nonce"},
        {"exp": int(time.time()) - 1},
        {"iss": "https://evil.example"},
    ],
)
def test_callback_rejects_invalid_id_token(make_client, claims):
    client, flow, _ = google_client(make_client, claims)
    flow.update(start(client))
    response = callback(client, code="auth-code", state=flow["state"])
    assert response.headers["location"] == "/?login_error=google_failed"
    assert client.get("/api/me").status_code == 401


def test_callback_token_endpoint_failure(make_client):
    client, flow, _ = google_client(make_client, fail=True)
    flow.update(start(client))
    response = callback(client, code="auth-code", state=flow["state"])
    assert response.headers["location"] == "/?login_error=google_failed"


def test_callback_user_cancelled(make_client):
    client, flow, _ = google_client(make_client)
    flow.update(start(client))
    response = callback(client, error="access_denied", state=flow["state"])
    assert response.status_code == 303
    assert response.headers["location"] == "/?login_error=google_cancelled"
    assert "trustlabel_oauth" not in client.cookies


def test_allowlist_must_map_to_active_person(make_client):
    with pytest.raises(SystemExit, match="marc"):
        make_client(google_exchange=lambda **_: {}, **{**GOOGLE, "google_accounts": {"marc@example.com": "marc"}})
