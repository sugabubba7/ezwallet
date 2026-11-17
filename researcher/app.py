"""Researcher service entry point:  uvicorn researcher.app:app --host 0.0.0.0 --port $PORT

Environment: RESEARCHER_TOKEN, plus the A2 tracker's model and search keys (see tracker/.env.local.example and .env.example).
The model, limits and fetch policy come from config.yaml; topic, k and the budget come from each request.
"""
import os

from kit.service import Route, build_app
from tracker.config import load_config
from tracker.llm import make_llm

from .core import research
from .models import ResearchPayload


def create_app(*, token: str | None = None, base_cfg=None, llm=None, search=None, fetch=None, **kw):
    cfg = base_cfg or load_config()
    llm = llm or make_llm(cfg)
    extra = {k: v for k, v in (("search", search), ("fetch", fetch)) if v is not None}
    route = Route("/research", ResearchPayload, lambda ctx: research(ctx, cfg, llm, **extra))
    return build_app(service="researcher", token=token or os.environ.get("RESEARCHER_TOKEN", ""), routes=[route], **kw)


def __getattr__(name):
    if name == "app":
        global app
        app = create_app()
        return app
    raise AttributeError(name)
