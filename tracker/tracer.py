"""Trace log: one JSON line per model call, tool call and state-API call."""
import json
import threading
from datetime import datetime, timezone
from pathlib import Path


def _short(v, n=300):
    if isinstance(v, str):
        return v if len(v) <= n else v[:n] + f"...(+{len(v) - n} chars)"
    if isinstance(v, dict):
        return {k: _short(x, n) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_short(x, n) for x in list(v)[:20]] + (["..."] if len(v) > 20 else [])
    return v


class Tracer:
    def __init__(self, path: str | Path | None):
        self.path = Path(path) if path else None
        self.rows: list[dict] = []
        self._lock = threading.Lock()
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text("")

    def log(self, *, step: int | None, kind: str, service: str, tool: str, args=None, status: str,
            latency_ms: int, tokens_in: int | None = None, tokens_out: int | None = None,
            credits: float | None = None, note: str | None = None) -> None:
        row = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "step": step, "kind": kind, "service": service, "tool": tool,
            "args": _short(args or {}), "status": status, "latency_ms": latency_ms,
            "tokens_in": tokens_in, "tokens_out": tokens_out, "credits": credits, "note": note,
        }
        with self._lock:
            self.rows.append(row)
            if self.path:
                with self.path.open("a") as f:
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
