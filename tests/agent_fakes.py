"""Scripted stand-ins for the A2 agent's model, search and fetch (same idea as tracker/tests, usable from tests/)."""
import hashlib

from tracker.dedupe import canonical_url
from tracker.llm import LlmResult


class Script:
    def __init__(self, turns, tokens=1000):
        self.turns, self.i, self.tokens, self.calls = list(turns), 0, tokens, 0

    def generate(self, system, contents, decls, allowed):
        self.calls += 1
        calls = self.turns[min(self.i, len(self.turns) - 1)]
        self.i += 1
        calls = calls(contents) if callable(calls) else calls
        return LlmResult(calls=calls, call_ids=[f"c{i}" for i in range(len(calls))], raw=None, prompt_tokens=self.tokens, output_tokens=100)


class Boom:
    def __init__(self, exc):
        self.exc, self.calls = exc, 0

    def generate(self, *a, **k):
        self.calls += 1
        raise self.exc


def article(url, text, title="T"):
    return {"url": url, "final_url": url, "canonical_url": canonical_url(url), "status_code": 200, "title": title, "published": None,
            "description": "", "text": text, "content_hash": hashlib.sha256(text.encode()).hexdigest(), "bytes": len(text),
            "fetched_at": "2026-10-04T00:00:00+00:00"}


def dev(rank, url, quote, title="Acme launches Vault", summary="Acme launched Vault."):
    return {"rank": rank, "title": title, "summary": summary, "sources": [{"url": url, "quote": quote}]}


def finish(*devs):
    return ("finish", {"report": {"developments": list(devs)}})


def fake_fetch(pages, log=None, hops_per_fetch=1):
    def fetch(url, policy, hops=None):
        if log is not None:
            log.append(url)
        if hops is not None:
            hops[0] += hops_per_fetch
        if url not in pages:
            from tracker.errors import ArticleError
            raise ArticleError("HTTP 404")
        return pages[url]
    return fetch


def fake_search(q, cfg, topic="general"):
    return {"results": [], "credits": 1}
