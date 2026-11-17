"""What a worker handler may raise to pick the HTTP answer."""


class Busy(Exception):
    """503: cannot take this right now (model rate limit, overloaded). The caller may retry after `retry_after` s."""

    def __init__(self, message: str, retry_after: float = 5.0):
        super().__init__(message)
        self.retry_after = max(1, int(round(retry_after)))


class Failed(Exception):
    """500: this worker failed for a reason retrying will not fix (bad model key, exhausted daily quota)."""

    def __init__(self, message: str, code: str = "worker_failed"):
        super().__init__(message)
        self.code = code
