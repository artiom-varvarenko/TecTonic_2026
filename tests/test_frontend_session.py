"""Aikido 765575000: a personal-key reply that arrives after the tab switched session never reaches the new one.

Runs the real static/app.js in headless Chromium against the real app; tests/frontend/key_session_harness.js holds
replies of account A (and of B's previous sign-in) until after the switch and checks the current session's DOM.
"""

import json
import os
import shutil
import socket
import subprocess
import threading
import time
from pathlib import Path

import pytest
import uvicorn
from conftest import DATA_DIR, login, password_for
from fastapi import Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

HARNESS = Path(__file__).parent / "frontend" / "key_session_harness.js"
HARNESS_PAGE = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>harness</title></head>'
    '<body><div id="app"></div><script type="module" src="/__harness/run.js"></script></body></html>'
)
CHROMIUM = next(
    (path for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable") if (path := shutil.which(name))),
    None,
)


@pytest.mark.skipif(CHROMIUM is None, reason="needs a Chromium binary")
def test_delayed_key_replies_never_reach_the_next_session(make_client, tmp_path):
    client = make_client()
    app = client.app
    names = {p["id"]: p["name"] for p in json.loads((DATA_DIR / "people.json").read_text(encoding="utf-8"))}
    for user in ("lotte", "jonas"):  # both accounts start with an active key, so the key card offers Revoke
        assert login(client, user).post("/api/connections/teams").status_code == 201

    result: dict = {}
    reported = threading.Event()

    @app.get("/__harness", include_in_schema=False)
    def harness_page() -> HTMLResponse:
        return HTMLResponse(HARNESS_PAGE)

    @app.get("/__harness/run.js", include_in_schema=False)
    def harness_script() -> FileResponse:
        return FileResponse(HARNESS, media_type="text/javascript")

    @app.get("/__harness/config", include_in_schema=False)
    def harness_config() -> JSONResponse:
        return JSONResponse(
            {
                key: {"username": user, "password": password_for(user), "name": names[user]}
                for key, user in (("a", "lotte"), ("b", "jonas"))
            }
        )

    @app.post("/__harness/result", include_in_schema=False)
    async def harness_result(request: Request) -> Response:
        result.update(await request.json())
        reported.set()
        return Response(status_code=204)

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning", lifespan="off"))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    assert server.started, "test server did not start"

    args = [
        CHROMIUM,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-background-networking",
        f"--user-data-dir={tmp_path / 'profile'}",
        f"http://127.0.0.1:{port}/__harness?view=integrations",
    ]
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        args.insert(1, "--no-sandbox")
    browser = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        assert reported.wait(90), "browser harness never reported"
    finally:
        browser.kill()
        browser.wait()
        server.should_exit = True
        thread.join(10)
        sock.close()

    assert result.get("error") is None, result["error"]
    assert result.get("failures") == []
