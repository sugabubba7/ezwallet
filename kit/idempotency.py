"""In-memory idempotency store.

begin() is atomic. For one request_id it returns exactly one of:
  NEW       you own it: do the work, then call finish() (or abort() if it blew up)
  REPLAY    same body already finished: return the stored response, do no work
  CONFLICT  same request_id, different body (409)
  RUNNING   first copy still in flight (503 + Retry-After)

Everything here lives in process memory. When Render spins the service down or restarts it, the store is
gone: a retried request is then NEW and the work is done again (costing one extra model/fetch spend, never a
wrong answer). Entries expire after `ttl_seconds` and the store is capped so a long-lived process cannot grow forever.
"""
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass

NEW, REPLAY, CONFLICT, RUNNING = "new", "replay", "conflict", "running"


@dataclass
class _Entry:
    digest: str
    started: float
    response: tuple[int, dict] | None = None


class IdempotencyStore:
    def __init__(self, ttl_seconds: float = 3600, max_entries: int = 1000, clock=time.monotonic):
        self._d: OrderedDict[str, _Entry] = OrderedDict()
        self._lock = threading.Lock()
        self.ttl, self.max, self.clock = ttl_seconds, max_entries, clock

    def _evict(self) -> None:
        now = self.clock()
        for k in [k for k, e in self._d.items() if e.response is not None and now - e.started > self.ttl]:
            del self._d[k]
        while len(self._d) > self.max:
            victim = next((k for k, e in self._d.items() if e.response is not None), None)
            if victim is None:
                break
            del self._d[victim]

    def begin(self, request_id: str, digest: str) -> tuple[str, tuple[int, dict] | None]:
        with self._lock:
            self._evict()
            e = self._d.get(request_id)
            if e is None:
                self._d[request_id] = _Entry(digest, self.clock())
                return NEW, None
            if e.digest != digest:
                return CONFLICT, None
            if e.response is None:
                return RUNNING, None
            return REPLAY, e.response

    def finish(self, request_id: str, status: int, body: dict) -> None:
        with self._lock:
            e = self._d.get(request_id)
            if e:
                e.response = (status, body)

    def abort(self, request_id: str) -> None:
        """The first copy failed without a storable answer: let a retry run it again."""
        with self._lock:
            e = self._d.get(request_id)
            if e and e.response is None:
                del self._d[request_id]
