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
    """Every scrypt slot taken, and a wait of milliseconds instead of seconds."""
    slots = threading.BoundedSemaphore(1)
    slots.acquire()
    monkeypatch.setattr(credentials, "_SCRYPT_SLOTS", slots)
    monkeypatch.setattr(credentials, "SCRYPT_WAIT_SECONDS", 0.01)
    return slots


def test_overlong_passwords_are_refused_without_hashing(held_slots):
    encoded = credentials._DUMMY_HASH
    assert verify_password("x" * (MAX_PASSWORD_CHARS + 1), encoded) is False  # no slot needed
    assert verify_password("x" * 100_000, None) is False
    with pytest.raises(ValueError):
        hash_password("x" * (MAX_PASSWORD_CHARS + 1))


def test_password_check_gives_up_when_every_slot_stays_taken(held_slots):
    with pytest.raises(PasswordCheckBusy):
        verify_password("correct horse", None)
    held_slots.release()
    encoded = hash_password("x" * MAX_PASSWORD_CHARS)
    assert verify_password("x" * MAX_PASSWORD_CHARS, encoded) is True
    assert held_slots.acquire(blocking=False)  # the slot was given back
