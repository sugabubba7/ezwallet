"""Adapts the A2 agent's tracer calls to the shared JSON-lines trace (one row per outgoing call, with the required fields)."""
from kit.trace import Trace


class KitTracer:
    """Agent.tracer replacement. Model, search and fetch calls become rows with direction "out" for this request."""

    def __init__(self, trace: Trace, run_id: str, request_id: str):
        self.trace, self.run_id, self.request_id = trace, run_id, request_id
        self.path = None
        self.rows: list[dict] = []
        self._attempt: dict[str, int] = {}

    def log(self, *, step=None, kind="", service="", tool="", args=None, status="", latency_ms=0, tokens_in=None,
            tokens_out=None, credits=None, note=None) -> None:
        if service == "runtime":  # finish-validation is local computation, not a call to anyone
            return
        if status == "retry":
            self._attempt[service] = self._attempt.get(service, 1) + 1
            attempt = self._attempt[service] - 1  # the attempt that just failed
        else:
            attempt = self._attempt.pop(service, 1)
        tokens = (tokens_in or 0) + (tokens_out or 0) or None
        self.trace.log(run_id=self.run_id, request_id=self.request_id, direction="out", endpoint_or_tool=f"{service}:{tool}",
                       status=status, latency_ms=latency_ms, step=step, attempt=attempt, tokens=tokens)
        self.rows.append({"service": service, "tool": tool, "status": status})
