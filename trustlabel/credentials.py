"""Per-user demo credentials: scrypt hashes in a local, gitignored JSON file.

Generate them with `uv run python -m trustlabel.credentials`; passwords are printed once.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import secrets
import sys
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from starlette.concurrency import run_in_threadpool

from .config import REPO_ROOT, credentials_path_from_env

SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
KEY_LEN = 32
MAX_PASSWORD_CHARS = 256  # LoginBody.password's max_length
# Each scrypt call needs ~16 MiB; cap concurrency so a login flood cannot exhaust memory.
_SCRYPT_SLOTS = threading.BoundedSemaphore(4)


class PasswordCheckBusy(Exception):
    """All password-verification slots are occupied; callers must retry later."""


@contextmanager
def _scrypt_slot() -> Iterator[None]:
    if not _SCRYPT_SLOTS.acquire(blocking=False):
        raise PasswordCheckBusy
    try:
        yield
    finally:
        _SCRYPT_SLOTS.release()


def _derive(password: str, salt: bytes) -> bytes:
    """Derive a key while the caller holds a scrypt slot."""
    return hashlib.scrypt(
        password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=KEY_LEN
    )


def hash_password(password: str) -> str:
    if len(password) > MAX_PASSWORD_CHARS:
        raise ValueError(f"Password is longer than {MAX_PASSWORD_CHARS} characters")
    salt = os.urandom(16)
    with _scrypt_slot():
        return f"scrypt${salt.hex()}${_derive(password, salt).hex()}"


# Unknown users are checked against this so the response time does not reveal valid usernames.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def _verify_password(password: str, encoded: str | None) -> bool:
    """Check a credential while the caller holds a scrypt slot."""
    try:
        scheme, salt_hex, hash_hex = (encoded or _DUMMY_HASH).split("$")
        salt, expected = bytes.fromhex(salt_hex), bytes.fromhex(hash_hex)
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    matches = hmac.compare_digest(_derive(password, salt), expected)
    return matches and encoded is not None


def verify_password(password: str, encoded: str | None) -> bool:
    """Check a password, rejecting saturated verifier capacity without waiting."""
    if len(password) > MAX_PASSWORD_CHARS:
        return False  # hash_password refuses passwords this long
    with _scrypt_slot():
        return _verify_password(password, encoded)


async def verify_password_async(password: str, encoded: str | None) -> bool:
    """Reserve capacity before entering the general request threadpool."""
    if len(password) > MAX_PASSWORD_CHARS:
        return False
    with _scrypt_slot():
        # run_in_threadpool waits for its worker on cancellation, so the slot remains
        # held until scrypt finishes; only admitted checks can occupy worker threads.
        return await run_in_threadpool(_verify_password, password, encoded)


def load_credentials(path: Path) -> dict[str, str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(
            "Missing credentials file: run `uv run python -m trustlabel.credentials`"
        ) from None
    if not isinstance(data, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in data.items()
    ):
        raise SystemExit(f"Invalid credentials file: {path}")
    return data


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m trustlabel.credentials",
        description="Generate a random demo password for every active person and store only scrypt hashes.",
    )
    parser.add_argument("--force", action="store_true", help="replace an existing credentials file")
    args = parser.parse_args(argv)

    path = credentials_path_from_env()
    if path.exists() and not args.force:
        print("Credentials file exists; use --force to regenerate", file=sys.stderr)
        return 1

    people = json.loads((REPO_ROOT / "data" / "people.json").read_text(encoding="utf-8"))
    passwords = {p["id"]: secrets.token_urlsafe(12) for p in people if p["active"]}
    hashes = {user_id: hash_password(pw) for user_id, pw in passwords.items()}

    path.unlink(missing_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(hashes, handle, indent=2)

    for user_id, password in passwords.items():
        print(f"{user_id:<8}{password}")
    print("Shown once — store them now.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
