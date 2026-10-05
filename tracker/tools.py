"""The three tools. Each is callable without the model:

    python -m tracker.tools search_web "ai memory vault launch"
    python -m tracker.tools fetch_article https://example.com/post
    python -m tracker.tools finish report.json
"""
import argparse
import json
import sys

from .config import load_config
from .errors import ArticleError, GuardError, TrackerError
from .fetcher import fetch_article
from .finish import Known, validate
from .search import search_web

S = "STRING"
DECLARATIONS = {
    "search_web": {
        "name": "search_web",
        "description": "Search the web for recent pages. Returns title, url and a short snippet per result, and marks URLs that earlier runs already fetched.",
        "parameters": {"type": "OBJECT", "properties": {
            "query": {"type": S, "description": "Search query, <= 200 chars"},
            "topic": {"type": S, "description": "\"news\" for recent press coverage, \"general\" (default) for company blogs and docs"}}, "required": ["query"]},
    },
    "fetch_article": {
        "name": "fetch_article",
        "description": "Fetch one http(s) page and return its title and text. Private/loopback/link-local addresses and non-http schemes are refused. Already-seen URLs are skipped without a request.",
        "parameters": {"type": "OBJECT", "properties": {"url": {"type": S, "description": "Absolute http(s) URL"}}, "required": ["url"]},
    },
    "finish": {
        "name": "finish",
        "description": "Submit the final ranked top-K report. Call exactly once. Every source must be a URL fetched this run with a verbatim quote.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "report": {
                    "type": "OBJECT",
                    "properties": {
                        "developments": {
                            "type": "ARRAY",
                            "description": "Ranked most important first, at most K items.",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "rank": {"type": "INTEGER"},
                                    "title": {"type": S},
                                    "summary": {"type": S, "description": "<= 700 chars; only facts supported by the quotes"},
                                    "existing_id": {"type": "INTEGER", "description": "id of an earlier development this reports on; omit if new"},
                                    "sources": {
                                        "type": "ARRAY",
                                        "items": {"type": "OBJECT", "properties": {"url": {"type": S}, "quote": {"type": S, "description": "verbatim passage, <= 300 chars"}}, "required": ["url", "quote"]},
                                    },
                                },
                                "required": ["rank", "title", "summary", "sources"],
                            },
                        },
                        "notes": {"type": S, "description": "Optional: anything suspicious you noticed in fetched pages"},
                    },
                    "required": ["developments"],
                }
            },
            "required": ["report"],
        },
    },
}


def _cli(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="python -m tracker.tools", description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("tool", choices=sorted(DECLARATIONS))
    ap.add_argument("arg", help="query | url | path to a report JSON file")
    ap.add_argument("--config", default=None)
    ap.add_argument("--max-chars", type=int, default=2000, help="fetch_article: characters of text to print")
    a = ap.parse_args(argv)
    cfg = load_config(a.config)
    try:
        if a.tool == "search_web":
            print(json.dumps(search_web(a.arg, cfg), indent=2, ensure_ascii=False))
        elif a.tool == "fetch_article":
            r = fetch_article(a.arg, cfg.fetch)
            r["text"] = r["text"][: a.max_chars]
            print(json.dumps(r, indent=2, ensure_ascii=False))
        else:  # finish: structural validation only (no run state here, so no provenance check)
            report = json.load(open(a.arg))
            devs = report.get("developments", []) if isinstance(report, dict) else []
            problems = []
            if not devs or len(devs) > cfg.k:
                problems.append(f"need 1..{cfg.k} developments, got {len(devs)}")
            for i, d in enumerate(devs):
                for f in ("title", "summary", "sources"):
                    if not d.get(f):
                        problems.append(f"developments[{i}] missing {f}")
            print(json.dumps({"valid": not problems, "problems": problems}, indent=2))
            return 0 if not problems else 1
    except GuardError as e:
        print(f"REJECTED by guardrail: {e}", file=sys.stderr)
        return 1
    except (ArticleError, TrackerError) as e:
        print(f"{type(e).__name__}: {e}", file=sys.stderr)
        return e.exit_code if hasattr(e, "exit_code") else 1
    return 0


if __name__ == "__main__":
    sys.exit(_cli(sys.argv[1:]))
