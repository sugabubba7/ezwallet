import json
from urllib.parse import urlsplit

from fastapi.testclient import TestClient

from kit.trace import Trace
from researcher.models import ResearchResult
from researcher.stub import DEFAULT_DATA, create_app
from .helpers import TOKEN, auth, env

DATA = json.loads(DEFAULT_DATA.read_text())["developments"]


def client():
    return TestClient(create_app(token=TOKEN, trace=Trace("researcher")))


def ask(c, k, **kw):
    return c.post("/research", json=env({"topic": "t", "k": k}, **kw), headers=auth())


def test_stub_data_is_real_looking_and_complete():
    assert len(DATA) >= 5
    for d in DATA:
        assert d["summary"] and d["sources"]
        for s in d["sources"]:
            assert urlsplit(s["url"]).scheme in ("http", "https") and len(s["quote"]) >= 40
            assert urlsplit(s["url"]).hostname not in ("example.com", "localhost")


def test_stub_follows_the_contract_and_the_schema():
    j = ask(client(), 3).json()
    assert j["status"] == "complete" and j["usage"] == {"steps": 0, "fetches": 0, "tokens": 0}
    ResearchResult.model_validate({"developments": j["developments"]})
    assert [d["title"] for d in j["developments"]] == [d["title"] for d in DATA[:3]]
    cited = {s["url"] for d in DATA[:3] for s in d["sources"]}
    assert {c["source_url"] for d in j["developments"] for c in d["claims"]} <= cited


def test_stub_asked_for_more_than_it_has_is_partial_with_what_it_has():
    j = ask(client(), 10).json()
    assert j["status"] == "partial" and len(j["developments"]) == len(DATA) and j["error"]["code"] == "no_more_data"


def test_stub_has_auth_validation_and_idempotency_like_the_real_one():
    c = client()
    assert c.post("/research", json=env({"topic": "t", "k": 3})).status_code == 401
    assert c.post("/research", json=env({"topic": "t", "k": 0}), headers=auth()).status_code == 400
    import uuid
    rid = str(uuid.uuid4())
    assert ask(c, 3, request_id=rid).status_code == 200
    assert ask(c, 4, request_id=rid).status_code == 409
