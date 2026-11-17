"""Stub researcher: the same /research contract, answered from a JSON file of real developments with real URLs.

For when the real tracker cannot run (no model or search key, quota spent). It follows the same envelope, auth, idempotency
and failure rules as the real researcher, because it is built on the same kit. It makes no model calls and no fetches, so its
usage is always zero. What it cannot do is find anything new: the assignment gives up the real top-K points for using it.

  uvicorn researcher.stub:app --port 8801        (data: researcher/stub_data.json, or STUB_DATA=/path/to/file.json)
"""
import json
import os
from pathlib import Path

from kit.service import Ctx, Reply, Route, build_app

from .claims import claims_for
from .models import ResearchPayload

DEFAULT_DATA = Path(__file__).with_name("stub_data.json")


def create_app(*, token: str | None = None, data_path: str | Path | None = None, **kw):
    data = json.loads(Path(data_path or os.environ.get("STUB_DATA") or DEFAULT_DATA).read_text())["developments"]

    def handler(ctx: Ctx) -> Reply:
        k = ctx.payload.k  # type: ignore[attr-defined]
        out = []
        for rank, d in enumerate(data[:k], 1):
            dev_id = f"d{rank}"
            out.append({"id": dev_id, "title": d["title"], "summary": d["summary"],
                        "claims": claims_for(dev_id, d["summary"], d["title"], d["sources"])})
        if len(out) == k:
            return Reply("complete", {"developments": out})
        return Reply("partial", {"developments": out}, error={
            "code": "no_more_data", "message": f"stopped after {len(out)} of {k} developments: the stub file has only {len(data)}", "retryable": False})

    route = Route("/research", ResearchPayload, handler)
    return build_app(service="researcher", token=token or os.environ.get("RESEARCHER_TOKEN", ""), routes=[route], **kw)


def __getattr__(name):
    if name == "app":
        global app
        app = create_app()
        return app
    raise AttributeError(name)
