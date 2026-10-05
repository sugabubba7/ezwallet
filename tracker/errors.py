"""Failure taxonomy. The retry layer only ever looks at these classes.

Transient  -> worth retrying with backoff (timeouts, 5xx, per-minute 429).
Terminal   -> retrying cannot help; stop with a clear message (bad key, daily
              quota, payment required, malformed request).
"""


class TrackerError(Exception):
    exit_code = 1


class TransientError(TrackerError):
    def __init__(self, message: str, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


class RateLimited(TransientError):
    """Per-minute style limit: the window resets on its own."""


class RetriesExhausted(TrackerError):
    exit_code = 3


class TerminalError(TrackerError):
    exit_code = 2


class AuthError(TerminalError):
    """Bad, revoked or missing API key / login."""


class DailyQuotaExhausted(TerminalError):
    """A per-day or per-plan cap. It will not reset for hours; never retry."""


class PaymentRequired(TerminalError):
    pass


class BadRequest(TerminalError):
    """Our request was malformed. Sending it again will fail the same way."""


class GuardError(TrackerError):
    """A URL was rejected by the fetch guardrail before any request was made."""


class BudgetExceeded(TrackerError):
    pass


class ArticleError(TrackerError):
    """A permanent, per-URL failure (404, 403...). Not worth retrying, and not a run failure."""


class RequestTooLarge(TerminalError):
    """The provider refused the prompt as larger than its per-request cap. The agent shrinks its prompt and retries;
    this only reaches the user if shrinking cannot help."""

    def __init__(self, message: str, limit: int | None = None, requested: int | None = None):
        super().__init__(message)
        self.limit, self.requested = limit, requested
