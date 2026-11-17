"""build_app(): one FastAPI app per worker, with the contract enforced in one place.

Order of checks for every POST (the assignment fixes it):
  1. token        -> 401 (before the body is even parsed, so an unauthenticated caller learns nothing about the schema)
  2. body is JSON, envelope and payload match the schema -> 400
  3. idempotency  -> 409 (same request_id, different body) / 503 + Retry-After (first copy still running) / stored reply
  4. the work     -> 200 (complete or partial), 503 (transient) or 500 (terminal)
"""
import hmac
import json
import logging
import time
from uuid import UUID
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

from .envelope import Budget, Envelope, body_hash
from .errors import Busy, Failed
from .idempotency import CONFLICT, NEW, REPLAY, RUNNING, IdempotencyStore
from .trace import Trace

MAX_BODY_BYTES = 1_000_000
RUNNING_RETRY_AFTER = 2


@dataclass
class Ctx:
    """What a handler sees. `t0` is when the worker received the request: the worker's clock starts there."""
    request_id: str
    run_id: str
    time_budget_ms: int
    budget: Budget
    payload: BaseModel
    trace: Trace
    t0: float
    clock: Callable[[], float] = time.monotonic

    def elapsed_ms(self) -> int:
        return int((self.clock() - self.t0) * 1000)

    def remaining_ms(self) -> int:
        return self.time_budget_ms - self.elapsed_ms()

    def expired(self) -> bool:
        return self.remaining_ms() <= 0


@dataclass
class Reply:
    status: str  # "complete" | "partial"
    result: dict[str, Any]
    usage: dict[str, int] = field(default_factory=lambda: {"steps": 0, "fetches": 0, "tokens": 0})
    error: dict[str, Any] | None = None  # set when status == "partial": why it stopped


@dataclass
class Route:
    path: str
    payload_model: type[BaseModel]
    handler: Callable[[Ctx], Reply]


def _err(status: int, code: str, message: str, *, retryable: bool = False, headers: dict | None = None, **ids) -> JSONResponse:
    body = {**{k: v for k, v in ids.items() if v}, "status": "failed",
            "error": {"code": code, "message": message, "retryable": retryable}}
    return JSONResponse(body, status_code=status, headers=headers)


def build_app(*, service: str, token: str, routes: list[Route], trace: Trace | None = None,
              store: IdempotencyStore | None = None, clock: Callable[[], float] = time.monotonic) -> FastAPI:
    if not token or len(token) < 16:
        raise RuntimeError(f"{service}: the service token is missing or shorter than 16 characters; refusing to start")
    trace = trace or Trace.from_env(service)
    store = store or IdempotencyStore()
    app = FastAPI(title=service, docs_url=None, redoc_url=None, openapi_url=None)  # no public schema: not for strangers

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    def make(route: Route):
        async def endpoint(request: Request):
            t0 = clock()
            ids: dict[str, Any] = {}
            usage_tokens: int | None = None

            def done(resp: JSONResponse, status_label=None) -> JSONResponse:
                trace.log(run_id=ids.get("run_id"), request_id=ids.get("request_id"), direction="in", endpoint_or_tool=route.path,
                          status=status_label or resp.status_code, latency_ms=int((clock() - t0) * 1000), tokens=usage_tokens)
                return resp

            # 1. token, compared in constant time, before anything else is looked at
            auth = request.headers.get("authorization", "")
            scheme, _, given = auth.partition(" ")
            if scheme.lower() != "bearer" or not hmac.compare_digest(given.strip().encode(), token.encode()):
                return done(_err(401, "unauthorized", "missing or wrong service token", headers={"WWW-Authenticate": "Bearer"}))

            # 2. schema
            raw = await request.body()
            if len(raw) > MAX_BODY_BYTES:
                return done(_err(400, "bad_request", "request body too large"))
            try:
                body = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                return done(_err(400, "bad_request", "body is not valid JSON"))
            if isinstance(body, dict):  # ids are only trusted for logging once they parse as UUIDs
                for k in ("request_id", "run_id"):
                    try:
                        ids[k] = str(UUID(str(body.get(k))))
                    except ValueError:
                        pass
            try:
                env = Envelope.model_validate(body)
                payload = route.payload_model.model_validate(env.payload)
            except ValidationError as e:
                first = e.errors()[0]
                where = ".".join(str(p) for p in first["loc"])
                return done(_err(400, "bad_request", f"invalid request: {where}: {first['msg']}", **ids))

            # 3. idempotency
            rid, digest = str(env.request_id), body_hash(body)
            state, stored = store.begin(rid, digest)
            if state == CONFLICT:
                return done(_err(409, "request_id_reused", "this request_id was already used with a different body", **ids))
            if state == RUNNING:
                return done(_err(503, "in_progress", "the first copy of this request is still running", retryable=True,
                                 headers={"Retry-After": str(RUNNING_RETRY_AFTER)}, **ids))
            if state == REPLAY:
                code, stored_body = stored
                return done(JSONResponse(stored_body, status_code=code), status_label=f"{code} replay")

            # 4. the work (blocking code runs in the thread pool so a duplicate arriving meanwhile is answered at once)
            ctx = Ctx(rid, str(env.run_id), env.time_budget_ms, env.budget, payload, trace, t0, clock)
            try:
                reply: Reply = await run_in_threadpool(route.handler, ctx)
            except Busy as e:
                store.abort(rid)
                return done(_err(503, "busy", str(e), retryable=True, headers={"Retry-After": str(e.retry_after)}, **ids))
            except Failed as e:
                store.abort(rid)
                return done(_err(500, e.code, str(e), **ids))
            except Exception:  # noqa: BLE001  never leak internals; the trace has the timing, the host log the traceback
                store.abort(rid)
                logging.getLogger(service).exception("unhandled error in %s", route.path)
                return done(_err(500, "internal_error", "the worker failed unexpectedly", **ids))
            out = {"request_id": rid, "run_id": ids["run_id"], "status": reply.status, "error": reply.error,
                   **reply.result, "usage": reply.usage}
            store.finish(rid, 200, out)
            usage_tokens = reply.usage.get("tokens")
            return done(JSONResponse(out, status_code=200))

        app.add_api_route(route.path, endpoint, methods=["POST"])

    for r in routes:
        make(r)
    return app
