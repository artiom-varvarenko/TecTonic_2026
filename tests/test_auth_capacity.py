import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from conftest import login, password_for
from test_google_auth import GOOGLE, callback
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from trustlabel import credentials
from trustlabel.app import (
    AUTH_MAX_FAILURES_PER_IP,
    LOGIN_MAX_FAILURES,
    LOGIN_WINDOW_SECONDS,
    SlidingWindow,
)


def test_one_failed_account_cannot_lock_other_accounts_on_same_ip(make_client):
    client = make_client()
    bad = {"username": "ellen", "password": "wrong"}
    for _ in range(LOGIN_MAX_FAILURES):
        assert client.post("/api/login", json=bad).status_code == 401
    for _ in range(AUTH_MAX_FAILURES_PER_IP * 2):
        assert client.post("/api/login", json=bad).status_code == 429
    assert login(client, "lotte").get("/api/me").status_code == 200


def test_forwarded_ip_rotation_does_not_reset_account_failure_budget(make_client):
    app = ProxyHeadersMiddleware(make_client().app, trusted_hosts=["127.0.0.1"])

    async def exercise():
        transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 12345))
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            for attempt in range(LOGIN_MAX_FAILURES):
                response = await client.post(
                    "/api/login",
                    json={"username": "ellen", "password": "wrong"},
                    headers={"X-Forwarded-For": f"198.51.100.{attempt + 1}"},
                )
                assert response.status_code == 401
            response = await client.post(
                "/api/login",
                json={"username": " ELLEN ", "password": password_for("ellen")},
                headers={"X-Forwarded-For": "203.0.113.1"},
            )
            assert response.status_code == 429

    asyncio.run(exercise())


def test_unknown_username_churn_cannot_evict_known_account_failures(make_client, monkeypatch):
    monkeypatch.setattr(SlidingWindow, "MAX_KEYS", 2)
    now = [1000.0]
    client = make_client(monotonic=lambda: now[0])
    for _ in range(LOGIN_MAX_FAILURES):
        assert client.post("/api/login", json={"username": "ellen", "password": "wrong"}).status_code == 401
    for number in range(8):
        now[0] += 1
        assert client.post("/api/login", json={"username": f"unknown{number}", "password": "wrong"}).status_code == 401
    assert client.post(
        "/api/login", json={"username": "ellen", "password": password_for("ellen")}
    ).status_code == 429
    assert login(client, "lotte").get("/api/me").status_code == 200
    now[0] += LOGIN_WINDOW_SECONDS
    assert login(client, "ellen").get("/api/me").status_code == 200


def test_oauth_garbage_never_blocks_password_login_or_grows_warning_volume(make_client, caplog):
    def no_exchange(**kwargs):
        pytest.fail("Malformed callbacks must not reach the provider")

    client = make_client(google_exchange=no_exchange, **GOOGLE)
    for number in range(AUTH_MAX_FAILURES_PER_IP * 3):
        params = {"error": "access_denied"} if number % 2 else {}
        assert callback(client, **params).status_code == 303
    warnings = [record for record in caplog.records if record.name == "trustlabel" and "Google sign-in failed" in record.message]
    assert len(warnings) == AUTH_MAX_FAILURES_PER_IP
    assert login(client, "lotte").get("/api/me").status_code == 200


def test_sliding_window_admission_and_storage_are_bounded_under_bursts(monkeypatch):
    monkeypatch.setattr(SlidingWindow, "MAX_KEYS", 8)
    now = [0.0]
    window = SlidingWindow(300, lambda: now[0])
    with ThreadPoolExecutor(max_workers=16) as workers:
        admitted = list(workers.map(lambda _: window.try_add("same-account", 5), range(200)))
    assert sum(admitted) == 5
    assert window.count("same-account") == 5
    for number in range(100):
        assert window.try_add(f"key-{number}", 5)
        assert len(window._events) <= window.MAX_KEYS
        assert all(len(events) <= 5 for events in window._events.values())
    now[0] += 300
    assert window.try_add("key-99", 5)
    assert window.count("key-99") == 1


def test_discarded_session_cookies_cannot_grow_registry_past_cap(make_client, monkeypatch):
    monkeypatch.setattr("trustlabel.app.MAX_SESSIONS", 3)
    client = make_client()
    sessions = [login(client, "lotte") for _ in range(4)]
    assert len(client.app.state.sessions) == 3
    assert sessions[0].get("/api/me").status_code == 401
    assert all(session.get("/api/me").status_code == 200 for session in sessions[1:])


def test_saturated_verifier_rejects_before_worker_dispatch_without_account_lock(make_client, monkeypatch):
    client = make_client()
    slots = threading.BoundedSemaphore(1)
    slots.acquire()

    async def no_worker(*args):
        pytest.fail("Saturated login must not dispatch a threadpool job")

    with monkeypatch.context() as patch:
        patch.setattr(credentials, "_SCRYPT_SLOTS", slots)
        patch.setattr(credentials, "run_in_threadpool", no_worker)
        for _ in range(LOGIN_MAX_FAILURES + 1):
            response = client.post("/api/login", json={"username": "lotte", "password": password_for("lotte")})
            assert response.status_code == 429
        assert client.get("/api/auth/providers").status_code == 200
    assert login(client, "lotte").get("/api/me").status_code == 200


def test_inflight_password_work_is_bounded_and_other_sync_handlers_remain_available(make_client, monkeypatch):
    app = make_client().app
    release = threading.Event()
    lock = threading.Lock()
    active = [0]
    monkeypatch.setattr(credentials, "_SCRYPT_SLOTS", threading.BoundedSemaphore(4))

    async def exercise():
        started = asyncio.Event()
        loop = asyncio.get_running_loop()

        def blocked_check(password, encoded):
            with lock:
                active[0] += 1
                if active[0] == 4:
                    loop.call_soon_threadsafe(started.set)
            assert release.wait(5), "Test failed to release admitted password workers"
            return False

        monkeypatch.setattr(credentials, "_verify_password", blocked_check)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            requests = [
                asyncio.create_task(client.post("/api/login", json={"username": f"unknown{n}", "password": "wrong"}))
                for n in range(4)
            ]
            try:
                await asyncio.wait_for(started.wait(), 2)
                response = await asyncio.wait_for(
                    client.post("/api/login", json={"username": "lotte", "password": "wrong"}), 1
                )
                assert response.status_code == 429
                assert (await asyncio.wait_for(client.get("/api/auth/providers"), 1)).status_code == 200
                assert active[0] == 4
            finally:
                release.set()
                responses = await asyncio.gather(*requests)
            assert all(response.status_code == 401 for response in responses)

    asyncio.run(exercise())
