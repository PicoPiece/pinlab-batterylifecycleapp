"""Small in-process login brute-force guard.

This is intentionally not a distributed rate limiter: the MVP runs one backend
process. A 15-minute rolling window avoids permanent admin lockout.
"""

from collections import defaultdict, deque
import threading
import time

MAX_FAILURES = 5
WINDOW_SECONDS = 15 * 60

_attempts: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def _prune(key: str, now: float) -> None:
    attempts = _attempts[key]
    while attempts and now - attempts[0] > WINDOW_SECONDS:
        attempts.popleft()
    if not attempts:
        _attempts.pop(key, None)


def login_key(host: str, email: str) -> str:
    return f"{host}:{email.strip().lower()}"


def is_login_blocked(key: str) -> tuple[bool, int]:
    now = time.monotonic()
    with _lock:
        _prune(key, now)
        attempts = _attempts.get(key)
        if not attempts or len(attempts) < MAX_FAILURES:
            return False, 0
        retry_after = max(1, int(WINDOW_SECONDS - (now - attempts[0])))
        return True, retry_after


def record_login_failure(key: str) -> None:
    now = time.monotonic()
    with _lock:
        _prune(key, now)
        _attempts[key].append(now)


def clear_login_failures(key: str) -> None:
    with _lock:
        _attempts.pop(key, None)
