"""A store with no memory, plugged into the A2 Agent in place of its backend client.

The assignment gives all state between runs to the orchestrator alone. The researcher therefore starts every request
with an empty past (nothing seen, nothing reported) and keeps the finished payload only long enough to return it.
"""


class StatelessStore:
    retries = 0

    def __init__(self):
        self.last_payload: dict | None = None

    def wake(self, *a, **k) -> None: ...
    def login(self) -> None: ...

    def state(self) -> dict:
        return {"developments": [], "seen_urls": [], "last_topk": [], "last_run_id": None}

    def start_run(self, topic: str, k: int) -> int:
        return 1

    def finish_run(self, run_id: int, payload: dict) -> dict:
        self.last_payload = payload
        ranked = [{"rank": d["rank"], "id": d["rank"], "title": d["title"], "summary": d["summary"], "section": "new",
                   "sources": d["sources"]} for d in sorted(payload["developments"], key=lambda d: d["rank"])]
        return {"developments": ranked, "dropped": []}

    def attach_report(self, run_id: int, report_md: str) -> None: ...
