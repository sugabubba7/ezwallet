"""Summarise a trace file: python -m tracker.trace_stats traces/run1.jsonl

Counts network round trips per service and where the wall-clock time went. Time asleep in retry backoff is
reported separately and subtracted from the call that slept."""
import json
import sys
from collections import defaultdict
from datetime import datetime


def summarise(path: str) -> dict:
    rows = [json.loads(line) for line in open(path) if line.strip()]
    by = defaultdict(lambda: {"calls": 0, "ms": 0, "errors": 0, "tokens_in": 0, "tokens_out": 0, "credits": 0.0})
    backoff_ms = retries = 0
    slept: dict[tuple, int] = defaultdict(int)  # (step, service) -> ms asleep; logged latency of the call includes it
    for r in rows:
        if r["kind"] == "retry":
            backoff_ms += r["latency_ms"]
            retries += 1
            slept[(r["step"], r["service"])] += r["latency_ms"]
    for r in rows:
        if r["kind"] == "retry":
            continue
        # tools the runtime answered itself (finish, denied/skipped/rejected before a request) made no round trip
        if r["service"] == "runtime" or r["status"] in ("denied", "skipped") or (r["tool"] == "fetch_article" and r["status"] == "rejected" and r["latency_ms"] < 5):
            continue
        s = by[r["service"]]
        s["calls"] += 1
        s["ms"] += max(0, r["latency_ms"] - slept.pop((r["step"], r["service"]), 0)) if r["kind"] != "state" else r["latency_ms"]
        s["errors"] += r["status"] == "error"
        s["tokens_in"] += r["tokens_in"] or 0
        s["tokens_out"] += r["tokens_out"] or 0
        s["credits"] += r["credits"] or 0
    t0, t1 = rows[0]["ts"], rows[-1]["ts"]
    wall = (datetime.fromisoformat(t1) - datetime.fromisoformat(t0)).total_seconds()
    return {"rows": len(rows), "wall_seconds": round(wall, 1), "retries": retries, "backoff_seconds": round(backoff_ms / 1000, 1),
            "round_trips": sum(v["calls"] for v in by.values()), "by_service": {k: v for k, v in sorted(by.items())}}


if __name__ == "__main__":
    out = summarise(sys.argv[1])
    print(f"{out['round_trips']} network round trips in {out['wall_seconds']}s wall clock "
          f"({out['retries']} retries, {out['backoff_seconds']}s asleep in backoff)")
    for svc, v in out["by_service"].items():
        print(f"  {svc:<11} {v['calls']:>3} calls  {v['ms'] / 1000:>7.1f}s  errors={v['errors']}  tokens in/out={v['tokens_in']}/{v['tokens_out']}  credits={v['credits']}")
