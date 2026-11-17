"""Verifier service entry point:  uvicorn verifier.app:app --host 0.0.0.0 --port $PORT

Environment (every name is listed in .env.example):
  VERIFIER_TOKEN                          bearer token callers must send
  VERIFIER_LLM_BASE_URL / _API_KEY / _MODEL   an OpenAI-compatible chat endpoint
  TRACE_PATH (optional)                   also write the trace to this file; lines always go to stdout too
"""
import os

from kit.service import Ctx, Route, build_app
from tracker.config import FetchPolicy

from .core import Fetcher, verify
from .llm import ChatLLM
from .models import VerifyPayload

DEFAULT_POLICY = FetchPolicy(
    allowed_schemes=("http", "https"), allowed_hosts=("*",),
    blocked_hosts=("*.jina.ai", "webcache.googleusercontent.com", "*.archive.org", "archive.ph", "archive.today", "*.12ft.io"),
    allowed_ports=(80, 443), timeout_seconds=10, total_timeout_seconds=20, max_bytes=4_000_000, max_redirects=3,
    user_agent="ezwallet-verifier/1.0 (course project)",
)


def create_app(*, token: str | None = None, llm=None, fetcher: Fetcher | None = None, **kw):
    fetcher = fetcher or Fetcher(DEFAULT_POLICY)
    llm = llm or ChatLLM.from_env()
    route = Route("/verify", VerifyPayload, lambda ctx: verify(ctx, fetcher, llm))
    return build_app(service="verifier", token=token or os.environ.get("VERIFIER_TOKEN", ""), routes=[route], **kw)


def __getattr__(name):  # `app` is built lazily so importing this module (tests, tooling) needs no env vars
    if name == "app":
        global app
        app = create_app()
        return app
    raise AttributeError(name)
