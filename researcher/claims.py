"""Break a development into claims: one per sentence of its summary, each citing the source that best supports it.

The summary is the researcher's own assertion, so it is exactly what a second agent should check against the page. (The
quotes were already checked verbatim by the tracker; they are not used as claims because they would pass trivially.)
"""
import re

_SENT = re.compile(r"(?<=[.!?])\s+(?=[\"'(\[]?[A-Z0-9$])")
_WORD = re.compile(r"[a-z0-9$%.]+")
MAX_CLAIMS = 4
MIN_CHARS = 20


def split_sentences(summary: str) -> list[str]:
    parts = [p.strip() for p in _SENT.split(" ".join(summary.split())) if p.strip()]
    merged: list[str] = []
    for p in parts:  # a fragment too short to be a claim joins the previous sentence
        if merged and len(p) < MIN_CHARS:
            merged[-1] += " " + p
        else:
            merged.append(p)
    return merged or ([summary.strip()] if summary.strip() else [])


def _terms(s: str) -> set[str]:
    return {w.strip(".") for w in _WORD.findall(s.lower()) if len(w.strip(".")) > 2}


def best_source(sentence: str, sources: list[dict]) -> dict:
    t = _terms(sentence)
    return max(sources, key=lambda s: len(t & _terms((s.get("quote") or "") + " " + (s.get("title") or ""))))  # ties: first source


def claims_for(dev_id: str, summary: str, title: str, sources: list[dict]) -> list[dict]:
    sentences = split_sentences(summary)[:MAX_CLAIMS] or [title]
    return [{"claim_id": f"{dev_id}-c{i}", "text": s[:2000], "source_url": best_source(s, sources)["url"]}
            for i, s in enumerate(sentences, 1)]
