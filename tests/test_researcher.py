import os

import pytest
from fastapi.testclient import TestClient

from kit.trace import Trace
from researcher.app import create_app
from researcher.claims import best_source, claims_for, split_sentences
from researcher.core import worker_config
from researcher.models import ResearchResult
from tracker.config import load_config
from tracker.errors import AuthError, RateLimited
from .agent_fakes import Boom, Script, article, dev, fake_fetch, fake_search, finish
from .helpers import TOKEN, auth, env

CFG = load_config()
URL1, URL2 = "https://acme.example/vault", "https://beta.example/news"
Q1 = "Acme today launched Vault, a private memory store for AI chats."
Q2 = "Beta Labs raised a $30 million Series A to build a competing memory layer."
P1 = article(URL1, Q1 + " Pricing starts at $12 per month. Vault is encrypted on the device.")
P2 = article(URL2, Q2 + " The round was led by Foo Ventures.")
PAGES = {URL1: P1, URL2: P2}


def rig(turns, *, pages=None, hops=1, llm=None):
    log, trace = [], Trace("researcher")
    llm = llm or Script(turns)
    app = create_app(token=TOKEN, base_cfg=CFG, llm=llm, search=fake_search, fetch=fake_fetch(pages or PAGES, log, hops), trace=trace)
    return TestClient(app), llm, log, trace


def ask(client, k=2, **kw):
    return client.post("/research", json=env({"topic": "memory vaults", "k": k}, **kw), headers=auth())


TWO_DEVS = [[("fetch_article", {"url": URL1}), ("fetch_article", {"url": URL2})],
            [finish(dev(1, URL2, Q2, "Beta raises $30M", "Beta Labs raised a $30 million Series A. The round was led by Foo Ventures."),
                    dev(2, URL1, Q1, summary="Acme launched Vault, from $12 per month."))]]


def test_happy_path_returns_ranked_developments_with_claims_that_cite_one_url_each():
    c, llm, log, _ = rig(TWO_DEVS)
    r = ask(c)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "complete" and j["error"] is None
    ResearchResult.model_validate({"developments": j["developments"]})  # the orchestrator's own schema accepts it
    d1, d2 = j["developments"]
    assert d1["title"] == "Beta raises $30M" and d2["title"] == "Acme launches Vault"  # rank order
    assert [x["text"] for x in d1["claims"]] == ["Beta Labs raised a $30 million Series A.", "The round was led by Foo Ventures."]
    assert {x["source_url"] for x in d1["claims"]} == {URL2} and {x["source_url"] for x in d2["claims"]} == {URL1}
    assert j["usage"]["steps"] == 2 and j["usage"]["fetches"] == 2 and j["usage"]["tokens"] > 0


def test_topic_and_k_come_from_the_request_not_from_config():
    seen = {}

    def turn(contents):
        seen["opening"] = contents[0]["text"]
        return [finish(dev(1, URL1, Q1))]
    c, *_ = rig([[("fetch_article", {"url": URL1})], turn])
    ask(c, k=1)
    assert '"K": 1' in seen["opening"] and "memory vaults" in seen["opening"]


def test_researcher_needs_no_database_settings_and_remembers_nothing():
    for name in ("TRACKER_API_URL", "TRACKER_LOGIN", "TRACKER_PASSWORD"):
        assert name not in os.environ
    turns = [[("fetch_article", {"url": URL1})], [finish(dev(1, URL1, Q1))]] * 2
    c, llm, log, _ = rig(turns)
    a, b = ask(c, k=1), ask(c, k=1)  # two different request_ids
    assert a.json()["developments"] == b.json()["developments"] and log == [URL1, URL1]  # fetched again: no "already seen" memory


@pytest.mark.parametrize("payload", [{"topic": "x", "k": 0}, {"topic": "x", "k": 11}, {"topic": "", "k": 3}, {"topic": "x"}, {"topic": "x", "k": 3, "known": []}])
def test_bad_payload_is_400_and_the_agent_never_runs(payload):
    c, llm, *_ = rig([[finish()]])
    assert c.post("/research", json=env(payload), headers=auth()).status_code == 400 and llm.calls == 0


def test_fetch_budget_is_hard_and_counts_every_redirect_hop():
    two_fetches = [[("fetch_article", {"url": URL1}), ("fetch_article", {"url": URL2})], [finish(dev(1, URL1, Q1))]]
    c, llm, log, _ = rig(two_fetches)
    j = ask(c, k=1, budget={"max_steps": 10, "max_fetches": 1, "max_tokens": 40000}).json()
    assert log == [URL1] and j["usage"]["fetches"] == 1  # the second request never reached the network

    c, llm, log, _ = rig(two_fetches, hops=2)  # each fetch used a redirect hop: 2 requests per page
    j = ask(c, k=1, budget={"max_steps": 10, "max_fetches": 2, "max_tokens": 40000}).json()
    assert log == [URL1] and j["usage"]["fetches"] == 2


def test_step_budget_leaves_one_call_for_the_final_report():
    endless = [[("fetch_article", {"url": URL1})]] + [[("fetch_article", {"url": f"https://x.example/{i}"})] for i in range(20)]
    endless.append([finish(dev(1, URL1, Q1))])
    c, llm, *_ = rig(endless)
    j = ask(c, k=1, budget={"max_steps": 3, "max_fetches": 8, "max_tokens": 400000}).json()
    assert llm.calls <= 3 and j["usage"]["steps"] == llm.calls
    assert j["status"] == "partial" and j["error"]["code"] == "step_budget_exhausted"


def test_worker_config_applies_the_envelope():
    from kit.envelope import Budget
    from kit.service import Ctx
    from researcher.models import ResearchPayload
    ctx = Ctx("r", "u", 10_000, Budget(max_steps=6, max_fetches=3, max_tokens=9000), ResearchPayload(topic="t", k=4), Trace("x"), 0.0)
    cfg = worker_config(CFG, ctx)
    assert (cfg.k, cfg.topic) == (4, "t") and cfg.limits.max_steps == 5 and cfg.limits.max_fetches == 3
    assert cfg.limits.max_total_tokens == 9000 and cfg.limits.finalize_reserve_tokens == 3000 and cfg.limits.max_wall_seconds == 8
    assert cfg.retry.max_retries == 1  # no long backoff sleeps while a caller waits


def test_bad_model_key_is_500_failed_not_retryable():
    c, llm, *_ = rig(None, llm=Boom(AuthError("openrouter: the API key was rejected (401)")))
    r = ask(c)
    assert r.status_code == 500 and r.json()["error"]["retryable"] is False and "API key" in r.json()["error"]["message"]


def test_model_rate_limit_that_outlasts_one_retry_is_503_with_retry_after():
    c, llm, *_ = rig(None, llm=Boom(RateLimited("openrouter: rate limited", retry_after=1)))
    r = ask(c)
    assert r.status_code == 503 and r.headers["Retry-After"].isdigit() and r.json()["error"]["retryable"] is True


def test_nothing_found_in_budget_is_partial_with_what_it_has():
    c, llm, *_ = rig(None, llm=Script([[("fetch_article", {"url": URL1})]]))
    j = ask(c, k=2, budget={"max_steps": 1, "max_fetches": 8, "max_tokens": 40000}).json()
    assert j["status"] == "partial" and j["error"]["retryable"] is False and j["developments"] == []


def test_trace_has_one_row_per_outgoing_call_with_ids_and_no_local_rows():
    c, llm, log, trace = rig(TWO_DEVS)
    body = env({"topic": "t", "k": 2})
    c.post("/research", json=body, headers=auth())
    out = [r for r in trace.rows if r["direction"] == "out"]
    kinds = [r["endpoint_or_tool"].split(":")[1] for r in out]
    assert kinds.count("fetch_article") == 2 and any(k.startswith("chat") for k in kinds) and "finish" not in kinds
    assert all(r["request_id"] == body["request_id"] and r["run_id"] == body["run_id"] for r in trace.rows)
    assert [r for r in trace.rows if r["direction"] == "in"][-1]["status"] == 200
    assert any(r["tokens"] for r in out)


# ---- claims ------------------------------------------------------------------------------------------------------
def test_sentence_splitting_keeps_decimals_and_merges_fragments():
    s = "Acme raised $2.5 million in March. The round was led by Foo Ventures. Yes."
    assert split_sentences(s) == ["Acme raised $2.5 million in March.", "The round was led by Foo Ventures. Yes."]
    assert split_sentences("  ") == []


def test_each_claim_cites_the_source_whose_quote_matches_it_best():
    sources = [{"url": "https://a/", "quote": "Acme raised a seed round of $20 million."},
               {"url": "https://b/", "quote": "Vault costs $12 per month for individuals."}]
    assert best_source("Vault pricing is $12 per month.", sources)["url"] == "https://b/"
    cl = claims_for("d1", "Acme raised a $20 million seed round. Vault costs $12 per month.", "T", sources)
    assert [c["source_url"] for c in cl] == ["https://a/", "https://b/"] and [c["claim_id"] for c in cl] == ["d1-c1", "d1-c2"]


def test_claims_are_capped_and_never_empty():
    many = " ".join(f"Sentence number {i} says something specific." for i in range(10))
    assert len(claims_for("d1", many, "T", [{"url": "https://a/", "quote": "q"}])) == 4
    assert claims_for("d1", "", "Title only", [{"url": "https://a/", "quote": "q"}])[0]["text"] == "Title only"
