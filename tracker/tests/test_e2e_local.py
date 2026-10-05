"""End-to-end recrawl against a REAL running backend and the REAL web, with a scripted model (no LLM quota used).

    TRACKER_E2E_API=http://127.0.0.1:8000 TRACKER_E2E_LOGIN=... TRACKER_E2E_PASSWORD=... pytest tracker/tests/test_e2e_local.py

Skipped unless those variables are set (it needs a backend on a throwaway database; it resets that user's tracker state).
"""
import os

import pytest

from tracker.agent import Agent
from tracker.config import load_config
from tracker.dedupe import canonical_url
from tracker.llm import LlmResult
from tracker.store import ApiStore
from tracker.tracer import Tracer

API = os.environ.get("TRACKER_E2E_API")
pytestmark = pytest.mark.skipif(not API, reason="set TRACKER_E2E_API to run against a live backend")

A = "https://example.com/"
B = "https://www.iana.org/help/example-domains"
Q_A = "This domain is for use in documentation examples without needing permission."


class Scripted:
    def __init__(self, turns):
        self.turns, self.i = turns, 0

    def generate(self, system, history, decls, allowed):
        calls = self.turns[min(self.i, len(self.turns) - 1)]
        self.i += 1
        return LlmResult(calls=calls, call_ids=[f"c{i}" for i in range(len(calls))], prompt_tokens=500, output_tokens=50)


def _agent(turns):
    cfg = load_config()
    tr = Tracer(None)
    store = ApiStore(API, os.environ["TRACKER_E2E_LOGIN"], os.environ["TRACKER_E2E_PASSWORD"], cfg.retry, tr)
    return Agent(cfg, Scripted(turns), store, tr, search=lambda q, c, t="general": {"results": [], "credits": 1}), store


def dev(title, rank, url, quote, eid=None):
    d = {"rank": rank, "title": title, "summary": title + ".", "sources": [{"url": url, "quote": quote}]}
    if eid:
        d["existing_id"] = eid
    return d


def test_two_runs_against_live_backend_and_web():
    ag1, store = _agent([[("fetch_article", {"url": A}), ("fetch_article", {"url": "http://169.254.169.254/latest/meta-data/"})],
                         [("finish", {"report": {"developments": [dev("Example Domain exists", 1, A, Q_A)]}})]])
    store.wake(); store.login(); store.reset()
    out1 = ag1.run()
    assert out1.status == "complete" and out1.saved and "New since last run" in out1.report_md
    state = store.state()
    assert [u["canonical_url"] for u in state["seen_urls"]] == [canonical_url(A)]
    first_id = state["developments"][0]["id"]

    # run 2: A is already known (must not be re-requested), B is new and reports the same development
    requested = []
    import tracker.fetcher as fetcher
    real = fetcher.fetch_article
    ag2, _ = _agent([[("fetch_article", {"url": A}), ("fetch_article", {"url": B})],
                     [("finish", {"report": {"developments": [dev("Example Domain exists", 1, B, "A number of domains such as example.com and example.org are maintained for documentation purposes.", first_id)]}})]])
    ag2.fetch_fn = lambda url, pol: (requested.append(url), real(url, pol))[1]
    out2 = ag2.run()
    assert A not in requested and B in requested                      # cached article skipped, new one fetched
    assert out2.status == "complete"
    detail = store._call("GET", f"/api/v1/tracker/runs/{out2.run_id}").json()
    assert [d["section"] for d in detail["developments"]] == ["still"]  # same development, now with two sources
    assert len(detail["developments"][0]["sources"]) == 2
    arts = {a["url"]: a["status"] for a in store._call("GET", f"/api/v1/tracker/runs/{out2.run_id}/articles").json()}
    assert arts[A] == "skipped" and arts[B] == "fetched"
    assert "Still in top K" in out2.report_md
    store.reset()
