"""JSON-lines trace log. One object per line with exactly the fields the assignment names.

Every field value is scrubbed of the service's secrets (any env var whose name ends in _TOKEN, _KEY or _SECRET),
so a token cannot reach a log even if some error message happens to contain it.
"""
import json
import os
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

FIELDS = ("ts", "service", "run_id", "request_id", "step", "direction", "endpoint_or_tool", "status", "latency_ms", "attempt", "tokens")


def _secrets() -> list[str]:
    return [v for k, v in os.environ.items() if v and len(v) >= 8 and k.upper().endswith(("_TOKEN", "_KEY", "_SECRET"))]


class Trace:
    def __init__(self, service: str, path: str | Path | None = None, stream=None):
        self.service = service
        self.path = Path(path) if path else None
        self.stream = stream
        self.rows: list[dict] = []
        self._lock = threading.Lock()
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)

    @classmethod
    def from_env(cls, service: str) -> "Trace":
        """TRACE_PATH writes a file; on a host with no persistent disk (Render) lines also go to stdout."""
        return cls(service, os.environ.get("TRACE_PATH"), sys.stdout if os.environ.get("TRACE_STDOUT", "1") == "1" else None)

    def log(self, *, run_id, request_id, direction: str, endpoint_or_tool: str, status, latency_ms: int,
            step: int | None = None, attempt: int = 1, tokens: int | None = None) -> None:
        row = {"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"), "service": self.service,
               "run_id": str(run_id) if run_id else None, "request_id": str(request_id) if request_id else None,
               "step": step, "direction": direction, "endpoint_or_tool": endpoint_or_tool, "status": status,
               "latency_ms": int(latency_ms), "attempt": attempt, "tokens": tokens}
        line = json.dumps(row, ensure_ascii=False)
        for s in _secrets():
            line = line.replace(s, "[redacted]")
        with self._lock:
            self.rows.append(json.loads(line))
            if self.path:
                with self.path.open("a") as f:
                    f.write(line + "\n")
            if self.stream:
                print(line, file=self.stream, flush=True)
