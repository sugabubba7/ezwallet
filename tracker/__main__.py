"""python -m tracker run [--report reports/run1.md] [--trace traces/run1.jsonl]
python -m tracker reset [--yes]"""
import argparse
import sys
from datetime import datetime, timezone

import httpx

from .agent import Agent
from .config import load_config, need_env
from .errors import TrackerError
from .llm import make_llm
from .store import ApiStore
from .tracer import Tracer


def _store(cfg, tracer) -> ApiStore:
    s = cfg.state
    return ApiStore(need_env(s["api_url_env"]), need_env(s["login_env"]), need_env(s["password_env"]), cfg.retry, tracer)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m tracker")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="run the agent once")
    r.add_argument("--report", default="reports/latest.md")
    r.add_argument("--trace", default=None)
    r.add_argument("--config", default=None)
    z = sub.add_parser("reset", help="forget all saved tracker state")
    z.add_argument("--yes", action="store_true")
    z.add_argument("--config", default=None)
    a = ap.parse_args(argv)
    cfg = load_config(a.config)
    try:
        if a.cmd == "reset":
            if not a.yes and input("Delete ALL saved tracker state for this account? type 'yes': ").strip() != "yes":
                print("aborted")
                return 1
            store = _store(cfg, Tracer(None))
            store.wake(); store.login(); store.reset()
            print("Tracker state reset.")
            return 0
        trace = a.trace or f"traces/run-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.jsonl"
        tracer = Tracer(trace)
        agent = Agent(cfg, make_llm(cfg), _store(cfg, tracer), tracer)
        out = agent.run(a.report)
        print(f"\n{out.message}\nreport: {a.report}\ntrace:  {trace}\nrun id: {out.run_id}  steps={out.stats['steps']} fetches={out.stats['fetches']} "
              f"tokens={out.stats['prompt_tokens'] + out.stats['output_tokens']} retries={out.stats['retries']}")
        return out.exit_code
    except TrackerError as e:
        print(f"\nSTOPPED ({type(e).__name__}): {e}", file=sys.stderr)
        return getattr(e, "exit_code", 1)
    except httpx.HTTPError as e:
        print(f"\nSTOPPED (network): {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
