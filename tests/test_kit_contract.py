"""The assignment's self-test table, run against kit.service with a stub handler."""
import threading
import uuid

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict

from kit.errors import Busy, Failed
from kit.service import Reply, Route, build_app
from kit.trace import Trace
from .helpers import TOKEN, auth, env


class P(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    n: int


class Rig:
    def __init__(self):
        self.calls = 0
        self.gate: threading.Event | None = None
        self.started = threading.Event()
        self.raise_: Exception | None = None
        self.trace = Trace("stub")
        self.app = build_app(service="stub", token=TOKEN, trace=self.trace, routes=[Route("/work", P, self.handle)])
        self.client = TestClient(self.app)

    def handle(self, ctx):
        self.calls += 1
        self.started.set()
        if self.gate:
            self.gate.wait(5)
        if self.raise_:
            raise self.raise_
        return Reply("complete", {"echo": ctx.payload.n}, {"steps": 1, "fetches": 0, "tokens": 7})


@pytest.fixture
def rig():
    return Rig()


def post(rig, body, headers=None, **kw):
    return rig.client.post("/work", json=body, headers=auth() if headers is None else headers, **kw)


def test_healthz_needs_no_token(rig):
    r = rig.client.get("/healthz")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer nope"}, {"Authorization": "Basic " + TOKEN}, {"Authorization": TOKEN}])
def test_missing_or_wrong_token_is_401(rig, headers):
    assert post(rig, env({"n": 1}), headers=headers).status_code == 401
    assert rig.calls == 0


def test_401_comes_before_schema_so_a_stranger_learns_nothing(rig):
    r = post(rig, {"garbage": True}, headers={})
    assert r.status_code == 401 and "request_id" not in r.text and "payload" not in r.text


@pytest.mark.parametrize("mutate", [
    lambda b: b.pop("payload"), lambda b: b.update(request_id="not-a-uuid"), lambda b: b.update(extra=1),
    lambda b: b.update(time_budget_ms="60000"), lambda b: b.update(time_budget_ms=0),
    lambda b: b["budget"].pop("max_fetches"), lambda b: b["payload"].update(n="1"), lambda b: b["payload"].update(x=1),
])
def test_schema_failures_are_400(rig, mutate):
    b = env({"n": 1})
    mutate(b)
    r = post(rig, b)
    assert r.status_code == 400 and rig.calls == 0


def test_non_json_body_is_400(rig):
    r = rig.client.post("/work", content=b"{nope", headers=auth())
    assert r.status_code == 400


def test_same_request_id_and_body_twice_does_the_work_once(rig):
    b = env({"n": 5})
    first, second = post(rig, b), post(rig, b)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() and first.json()["echo"] == 5
    assert rig.calls == 1


def test_key_order_and_whitespace_do_not_make_a_different_body(rig):
    import json
    b = env({"n": 5})
    reordered = json.dumps(dict(reversed(list(b.items()))), indent=3).encode()
    assert post(rig, b).status_code == 200
    r = rig.client.post("/work", content=reordered, headers={**auth(), "content-type": "application/json"})
    assert r.status_code == 200 and rig.calls == 1


def test_same_request_id_different_body_is_409(rig):
    rid = str(uuid.uuid4())
    assert post(rig, env({"n": 1}, request_id=rid)).status_code == 200
    r = post(rig, env({"n": 2}, request_id=rid))
    assert r.status_code == 409 and rig.calls == 1


def test_shrinking_time_budget_on_a_retry_is_a_different_request(rig):
    rid, run = str(uuid.uuid4()), str(uuid.uuid4())
    assert post(rig, env({"n": 1}, request_id=rid, run_id=run, time_budget_ms=60000)).status_code == 200
    assert post(rig, env({"n": 1}, request_id=rid, run_id=run, time_budget_ms=30000)).status_code == 409


def test_duplicate_while_first_is_running_is_503_with_retry_after(rig):
    rig.gate = threading.Event()
    b = env({"n": 1})
    out = {}
    t = threading.Thread(target=lambda: out.update(first=TestClient(rig.app).post("/work", json=b, headers=auth())))
    t.start()
    assert rig.started.wait(5)
    dup = post(rig, b)
    rig.gate.set()
    t.join(5)
    assert dup.status_code == 503 and dup.headers["Retry-After"].isdigit()
    assert out["first"].status_code == 200 and rig.calls == 1
    assert post(rig, b).json() == out["first"].json()  # and afterwards the stored answer is served


def test_503_is_not_stored_so_a_retry_runs_the_work(rig):
    rig.raise_ = Busy("model rate limit", 3)
    b = env({"n": 1})
    r = post(rig, b)
    assert r.status_code == 503 and r.headers["Retry-After"] == "3" and r.json()["error"]["retryable"] is True
    rig.raise_ = None
    assert post(rig, b).status_code == 200 and rig.calls == 2


def test_terminal_failure_is_500_not_retryable_and_leaks_nothing(rig):
    rig.raise_ = Failed("bad model key", "model_unavailable")
    r = post(rig, env({"n": 1}))
    assert r.status_code == 500 and r.json()["status"] == "failed" and r.json()["error"]["retryable"] is False
    rig.raise_ = RuntimeError("secret internals: " + TOKEN)
    r = post(rig, env({"n": 1}))
    assert r.status_code == 500 and TOKEN not in r.text and "internals" not in r.text


def test_response_carries_ids_status_and_usage(rig):
    b = env({"n": 3})
    j = post(rig, b).json()
    assert j["request_id"] == b["request_id"] and j["run_id"] == b["run_id"]
    assert j["status"] == "complete" and j["error"] is None and j["usage"] == {"steps": 1, "fetches": 0, "tokens": 7}


def test_trace_rows_have_exactly_the_required_fields_and_no_token(rig):
    b = env({"n": 1})
    post(rig, b)
    post(rig, b, headers={})
    fields = {"ts", "service", "run_id", "request_id", "step", "direction", "endpoint_or_tool", "status", "latency_ms", "attempt", "tokens"}
    assert len(rig.trace.rows) == 2
    for row in rig.trace.rows:
        assert set(row) == fields and row["direction"] == "in" and row["service"] == "stub"
    assert rig.trace.rows[0]["request_id"] == b["request_id"] and rig.trace.rows[0]["tokens"] == 7
    assert rig.trace.rows[1]["status"] == 401
    assert TOKEN not in str(rig.trace.rows)


def test_trace_scrubs_secrets_from_env(monkeypatch):
    monkeypatch.setenv("SOME_API_KEY", "sk-super-secret-value")
    t = Trace("x")
    t.log(run_id=None, request_id=None, direction="out", endpoint_or_tool="model", status="error sk-super-secret-value", latency_ms=1)
    assert "sk-super-secret-value" not in str(t.rows) and "[redacted]" in str(t.rows)


def test_refuses_to_start_without_a_real_token():
    with pytest.raises(RuntimeError):
        build_app(service="x", token="short", routes=[])
