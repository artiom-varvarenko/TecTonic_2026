import asyncio
import threading

import pytest

from trustlabel import credentials
from trustlabel.credentials import (
    MAX_PASSWORD_CHARS,
    PasswordCheckBusy,
    hash_password,
    verify_password,
)


@pytest.fixture
def held_slots(monkeypatch):
    """Every scrypt slot taken; fail deterministically if acquisition could wait."""
    slots = threading.BoundedSemaphore(1)
    slots.acquire()
    monkeypatch.setattr(credentials, "_SCRYPT_SLOTS", slots)
    acquire = slots.acquire

    def acquire_nowait(*, blocking):
        assert blocking is False
        return acquire(blocking=False)

    monkeypatch.setattr(slots, "acquire", acquire_nowait)
    return slots


def test_overlong_passwords_are_refused_without_hashing(held_slots):
    encoded = credentials._DUMMY_HASH
    assert verify_password("x" * (MAX_PASSWORD_CHARS + 1), encoded) is False  # no slot needed
    assert verify_password("x" * 100_000, None) is False
    with pytest.raises(ValueError):
        hash_password("x" * (MAX_PASSWORD_CHARS + 1))


def test_password_check_rejects_immediately_when_every_slot_is_taken(held_slots):
    with pytest.raises(PasswordCheckBusy):
        verify_password("correct horse", None)
    held_slots.release()
    encoded = hash_password("x" * MAX_PASSWORD_CHARS)
    assert verify_password("x" * MAX_PASSWORD_CHARS, encoded) is True
    assert held_slots.acquire(blocking=False)  # the slot was given back


def test_async_password_check_rejects_before_entering_threadpool(held_slots, monkeypatch):
    async def unexpected_worker(*args):
        pytest.fail("Saturated password checks must not enter the request threadpool")

    monkeypatch.setattr(credentials, "run_in_threadpool", unexpected_worker)
    with pytest.raises(PasswordCheckBusy):
        asyncio.run(credentials.verify_password_async("wrong", None))


def test_known_and_unknown_password_checks_both_derive_once(monkeypatch):
    calls = []
    derive = credentials._derive

    def recorded_derive(password, salt):
        calls.append((password, salt))
        return derive(password, salt)

    monkeypatch.setattr(credentials, "_derive", recorded_derive)
    assert verify_password("wrong", credentials._DUMMY_HASH) is False
    assert verify_password("wrong", None) is False
    assert len(calls) == 2
    assert calls[0] == calls[1]
