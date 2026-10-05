"""Retry transient failures with capped exponential backoff; never retry terminal ones."""
import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar

from .errors import RetriesExhausted, TerminalError, TransientError

T = TypeVar("T")


@dataclass(frozen=True)
class RetryPolicy:
    max_retries: int = 3  # retries after the first attempt
    base_delay: float = 2.0
    max_delay: float = 30.0  # cap for one sleep
    max_retry_after: float = 90.0  # a server asking for longer than this is treated as "give up"


def backoff_delay(policy: RetryPolicy, attempt: int, retry_after: float | None, rng: random.Random | None = None) -> float:
    exp = min(policy.max_delay, policy.base_delay * (2**attempt))
    jitter = (rng or random).uniform(0, exp * 0.25)
    wanted = max(exp + jitter, retry_after or 0.0)
    return min(wanted, max(policy.max_delay, retry_after or 0.0))


def call_with_retries(
    fn: Callable[[], T],
    policy: RetryPolicy,
    *,
    label: str,
    on_retry: Callable[[int, float, Exception], None] | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> T:
    attempt = 0
    while True:
        try:
            return fn()
        except TerminalError:
            raise  # a bad key or a daily cap: retrying is a bug
        except TransientError as e:
            if e.retry_after and e.retry_after > policy.max_retry_after:
                raise RetriesExhausted(f"{label}: server asked us to wait {e.retry_after:.0f}s; giving up ({e})") from e
            if attempt >= policy.max_retries:
                raise RetriesExhausted(f"{label}: still failing after {policy.max_retries} retries ({e})") from e
            delay = backoff_delay(policy, attempt, e.retry_after)
            if on_retry:
                on_retry(attempt + 1, delay, e)
            sleep(delay)
            attempt += 1
