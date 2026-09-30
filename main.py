"""Run the TrustLabel demo server: `uv run --env-file .env main.py`, then open http://127.0.0.1:8000.

Behind a tunnel on this machine (e.g. `cloudflared tunnel --url http://127.0.0.1:8000`), set TRUSTLABEL_BEHIND_PROXY=1
so the login rate limit sees the real client IP. TRUSTLABEL_PORT changes the port.
"""

import os

import uvicorn

from trustlabel.app import create_app
from trustlabel.config import Settings

if __name__ == "__main__":
    uvicorn.run(
        create_app(Settings.from_env()),
        host="127.0.0.1",
        port=int(os.environ.get("TRUSTLABEL_PORT", "8000")),
        # X-Forwarded-For may rewrite the client IP only when opted in, and only from a proxy on this machine.
        proxy_headers=os.environ.get("TRUSTLABEL_BEHIND_PROXY") == "1",
        forwarded_allow_ips="127.0.0.1",
    )
