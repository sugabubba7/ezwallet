"""Run the A2 tracker Agent for one request, inside the budget the orchestrator gave this worker."""
import dataclasses
import time
from collections.abc import Callable

from kit.errors import Busy, Failed
from kit.service import Ctx, Reply
from tracker.agent import Agent
from tracker.config import Config
from tracker.errors import GuardError, RetriesExhausted, TerminalError
from tracker.fetcher import fetch_article
from tracker.retry import RetryPolicy
from tracker.search import search_web

from .claims import claims_for
from .store import StatelessStore
from .trace import KitTracer

TIME_SHARE = 0.8  # the agent may use this much of the time budget; the rest is for writing the report and answering


class StepLimit(TerminalError):
    """The envelope's max_steps is used up. Raised before the call is made, so the budget is never exceeded."""


class CountingLLM:
    """Counts model calls (a step is one model call, retries and the final report included) and refuses to exceed the budget.

    The agent keeps its own step counter, but its forced final report may try up to three times outside that counter, so
    the hard cap has to live here."""

    def __init__(self, inner, limit: int):
        self.inner, self.limit, self.calls = inner, limit, 0

    def generate(self, *a, **k):
        if self.calls >= self.limit:
            raise StepLimit(f"step budget exhausted ({self.limit} model calls)")
        self.calls += 1
        return self.inner.generate(*a, **k)

    def __getattr__(self, name):
        return getattr(self.inner, name)


def worker_config(base: Config, ctx: Ctx) -> Config:
    p = ctx.payload
    b = ctx.budget
    lim = dataclasses.replace(
        base.limits,
        max_steps=max(0, b.max_steps - 1),  # one call is reserved for the final report and is counted on top
        max_fetches=b.max_fetches,
        max_total_tokens=b.max_tokens,
        finalize_reserve_tokens=min(base.limits.finalize_reserve_tokens, b.max_tokens // 3),
        max_wall_seconds=max(1, int(ctx.time_budget_ms / 1000 * TIME_SHARE)),
    )
    # A caller is waiting on this request: do not sleep out long provider backoffs inside it. A rate limit that outlasts
    # one short retry comes back to the orchestrator as a 503, and the orchestrator owns retrying.
    rty = RetryPolicy(max_retries=1, base_delay=min(2.0, base.retry.base_delay), max_delay=min(8.0, base.retry.max_delay),
                      max_retry_after=min(20.0, base.retry.max_retry_after))
    return dataclasses.replace(base, topic=p.topic, k=p.k, limits=lim, retry=rty)


_REASONS = (("time budget", "time_budget_exhausted"), ("step budget", "step_budget_exhausted"), ("token budget", "token_budget_exhausted"),
            ("cost budget", "cost_budget_exhausted"), ("fetch budget", "fetch_budget_exhausted"), ("search budget", "search_budget_exhausted"))


def _code(reason: str) -> str:
    low = reason.lower()
    return next((c for k, c in _REASONS if k in low), "stopped_early")


def research(ctx: Ctx, base: Config, llm, *, search: Callable = search_web, fetch: Callable = fetch_article,
             sleep: Callable = time.sleep) -> Reply:
    cfg = worker_config(base, ctx)
    store, tracer, counting = StatelessStore(), KitTracer(ctx.trace, ctx.run_id, ctx.request_id), CountingLLM(llm, ctx.budget.max_steps)
    fetched = [0]

    def budgeted_fetch(url, policy):
        """Every HTTP request counts against max_fetches, each redirect hop included (the agent counts calls, not hops)."""
        left = ctx.budget.max_fetches - fetched[0]
        if left <= 0:
            raise GuardError("fetch budget exhausted")
        hops = [0]
        try:
            return fetch(url, dataclasses.replace(policy, max_redirects=min(policy.max_redirects, left - 1)), hops)
        finally:
            fetched[0] += hops[0]

    agent = Agent(cfg, counting, store, tracer, search=search, fetch=budgeted_fetch, sleep=sleep)
    outcome = agent.run(None)

    def usage() -> dict:
        return {"steps": counting.calls, "fetches": fetched[0], "tokens": agent.tokens}

    payload = store.last_payload or {"developments": []}
    devs = sorted(payload["developments"], key=lambda d: d["rank"]) if agent.final is not None else []

    if not devs and agent.fatal is not None and not isinstance(agent.fatal, StepLimit):
        if isinstance(agent.fatal, TerminalError):
            raise Failed(str(agent.fatal), "researcher_failed")
        if isinstance(agent.fatal, RetriesExhausted):
            raise Busy(str(agent.fatal), 15.0)

    out = []
    for d in devs:
        dev_id = f"d{d['rank']}"
        out.append({"id": dev_id, "title": d["title"], "summary": d["summary"],
                    "claims": claims_for(dev_id, d["summary"], d["title"], d["sources"])})
    if outcome.status == "complete":
        return Reply("complete", {"developments": out}, usage())
    why = payload.get("partial_reason") or outcome.message
    return Reply("partial", {"developments": out}, usage(),
                 {"code": _code(why), "message": f"stopped after {len(out)} of {ctx.payload.k} developments: {why}"[:500], "retryable": False})
