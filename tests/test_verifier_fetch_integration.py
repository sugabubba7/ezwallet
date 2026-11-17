"""The real A2 fetcher (not a fake) behind the verifier: a public URL that redirects to a forbidden address."""
import httpx
import pytest
from fastapi.testclient import TestClient

from kit.trace import Trace
from tracker import fetcher as fetcher_mod
from verifier.app import DEFAULT_POLICY, create_app
from verifier.core import Fetcher
from .helpers import TOKEN, auth, env
from .test_verifier import ACME, PAGE, FakeLLM, good

real_client = httpx.Client


def dns(mapping):
    """Like real getaddrinfo: an IP literal resolves to itself; names come from `mapping` (default: a public IP)."""
    import ipaddress

    def resolve(host, port):
        try:
            return [str(ipaddress.ip_address(host))]
        except ValueError:
            return [mapping(host)]
    return resolve


def serve(monkeypatch, handler, resolve):
    monkeypatch.setattr("tracker.guard.resolve", resolve)
    monkeypatch.setattr(fetcher_mod.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler)))


def app_with(llm):
    return TestClient(create_app(token=TOKEN, llm=llm, fetcher=Fetcher(DEFAULT_POLICY), trace=Trace("verifier")))


def post(client, claims, **kw):
    return client.post("/verify", json=env({"claims": claims}, **kw), headers=auth()).json()


def test_public_url_redirecting_to_the_metadata_address_is_unreachable_and_never_requested(monkeypatch):
    seen = []

    def handler(req):
        seen.append(str(req.url))
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data/"})

    serve(monkeypatch, handler, dns(lambda h: "93.184.216.34"))
    llm = FakeLLM(good())
    j = post(app_with(llm), [{"claim_id": "c1", "text": "x", "source_url": "https://public.example/a"}])
    assert j["verdicts"] == [{"claim_id": "c1", "verdict": "unreachable", "evidence": None}]
    assert len(seen) == 1 and "169.254" not in seen[0] and llm.calls == 0  # only the public hop was ever sent
    assert j["usage"]["fetches"] == 1


def test_hostname_that_resolves_to_a_private_ip_is_refused_before_any_request(monkeypatch):
    seen = []
    serve(monkeypatch, lambda r: seen.append(r) or httpx.Response(200), dns(lambda h: "10.1.2.3"))
    j = post(app_with(FakeLLM(good())), [{"claim_id": "c1", "text": "x", "source_url": "https://innocent-name.example/"}])
    assert j["verdicts"][0]["verdict"] == "unreachable" and seen == [] and j["usage"]["fetches"] == 0


def test_redirect_hops_use_up_the_fetch_budget_and_cap_redirects(monkeypatch):
    n = []

    def handler(req):
        n.append(1)
        return httpx.Response(302, headers={"location": f"https://public.example/{len(n)}"})

    serve(monkeypatch, handler, dns(lambda h: "93.184.216.34"))
    j = post(app_with(FakeLLM(good())), [{"claim_id": "c1", "text": "x", "source_url": "https://public.example/0"}],
             budget={"max_steps": 10, "max_fetches": 2, "max_tokens": 40000})
    assert len(n) <= 2 and j["usage"]["fetches"] <= 2 and j["verdicts"][0]["verdict"] == "unreachable"


def test_happy_path_through_the_real_fetcher_and_html_extraction(monkeypatch):
    html = f"<html><head><title>t</title></head><body><nav>menu</nav><p>{PAGE}</p></body></html>"
    serve(monkeypatch, lambda r: httpx.Response(200, text=html, headers={"content-type": "text/html"}), dns(lambda h: "93.184.216.34"))
    j = post(app_with(FakeLLM(good())), [{"claim_id": "c1", "text": "Acme raised $20M", "source_url": "https://public.example/a"}])
    assert j["verdicts"] == [{"claim_id": "c1", "verdict": "supported", "evidence": ACME}] and j["usage"]["fetches"] == 1
