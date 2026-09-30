"""Run the TrustLabel demo server: `uv run --env-file .env main.py`, then open http://127.0.0.1:8000."""

import uvicorn

from trustlabel.app import create_app
from trustlabel.config import Settings

if __name__ == "__main__":
    # No reverse proxy in front: never let X-Forwarded-For rewrite the client IP (login rate limit).
    uvicorn.run(create_app(Settings.from_env()), host="127.0.0.1", port=8000, proxy_headers=False)
