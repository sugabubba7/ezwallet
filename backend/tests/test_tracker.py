"""Tracker API: auth (401), per-user isolation, recrawl diff, XSS-safe URLs, reset."""
import hashlib

H = hashlib.sha256(b"x").hexdigest()


def _auth(client, creds):
    r = client.post("/api/v1/auth/register", json=creds)
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _dev(title, rank, existing_id=None, url=None):
    return {
        "existing_id": existing_id,
        "title": title,
        "summary": f"{title} summary",
        "rank": rank,
        "sources": [{"url": url or f"https://example.com/{title.replace(' ', '-')}", "title": title, "quote": "q"}],
    }


def _article(url, status="fetched", reason=None):
    return {"url": url, "canonical_url": url, "title": "T", "status": status, "reason": reason, "content_hash": H}


def _run(client, h, devs, articles=(), k=3, status="complete"):
    rid = client.post("/api/v1/tracker/runs", json={"topic": "t", "k": k}, headers=h).json()["id"]
    r = client.post(
        f"/api/v1/tracker/runs/{rid}/finish",
        json={"status": status, "report_md": "# r", "stats": {"steps": 1}, "articles": list(articles), "developments": devs},
        headers=h,
    )
    return rid, r


def test_every_endpoint_requires_a_token(client):
    calls = [
        ("get", "/state"), ("delete", "/state"), ("post", "/runs"), ("get", "/runs"), ("get", "/runs/latest"),
        ("get", "/runs/1"), ("get", "/runs/1/articles"), ("post", "/runs/1/finish"), ("put", "/runs/1/report"),
    ]
    for method, path in calls:
        r = getattr(client, method)("/api/v1/tracker" + path)
        assert r.status_code == 401, (method, path)
        r = getattr(client, method)("/api/v1/tracker" + path, headers={"Authorization": "Bearer nope"})
        assert r.status_code == 401, (method, path)


def test_second_run_separates_new_still_dropped(client, creds):
    h = _auth(client, creds)
    _, r1 = _run(client, h, [_dev("A", 1), _dev("B", 2), _dev("C", 3)], [_article("https://example.com/a")])
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert [d["section"] for d in d1["developments"]] == ["new", "new", "new"]
    ids = {d["title"]: d["id"] for d in d1["developments"]}

    state = client.get("/api/v1/tracker/state", headers=h).json()
    assert [u["canonical_url"] for u in state["seen_urls"]] == ["https://example.com/a"]
    assert {t["development_id"] for t in state["last_topk"]} == set(ids.values())

    # Run 2: B stays (new supporting URL), A is dropped, D is new.
    _, r2 = _run(client, h, [_dev("B", 1, ids["B"], "https://other.com/b2"), _dev("D", 2), _dev("C", 3, ids["C"])])
    d2 = r2.json()
    by = {d["title"]: d for d in d2["developments"]}
    assert by["D"]["section"] == "new"
    assert by["B"]["section"] == "still" and len(by["B"]["sources"]) == 2
    assert by["C"]["section"] == "still"
    assert [x["title"] for x in d2["dropped"]] == ["A"]
    assert (d2["new_count"], d2["still_count"], d2["dropped_count"]) == (1, 2, 1)


def test_cannot_exceed_k_or_finish_twice(client, creds):
    h = _auth(client, creds)
    _, r = _run(client, h, [_dev(c, i) for i, c in enumerate("ABCD", 1)], k=3)
    assert r.status_code == 400
    rid, ok = _run(client, h, [_dev("A", 1)])
    assert ok.status_code == 200
    again = client.post(f"/api/v1/tracker/runs/{rid}/finish", json={"status": "complete"}, headers=h)
    assert again.status_code == 409


def test_users_are_isolated(client, creds):
    h1 = _auth(client, creds)
    rid, r = _run(client, h1, [_dev("Private", 1)], [_article("https://example.com/p")])
    dev_id = r.json()["developments"][0]["id"]
    h2 = _auth(client, {"email": "other-tracker@example.com", "password": "Sup3rSecret!", "pin": "4821"})
    assert client.get(f"/api/v1/tracker/runs/{rid}", headers=h2).status_code == 404
    assert client.get(f"/api/v1/tracker/runs/{rid}/articles", headers=h2).status_code == 404
    assert client.get("/api/v1/tracker/runs", headers=h2).json() == []
    assert client.get("/api/v1/tracker/runs/latest", headers=h2).status_code == 404
    st = client.get("/api/v1/tracker/state", headers=h2).json()
    assert st["developments"] == [] and st["seen_urls"] == []
    # cannot attach to, or finish, someone else's objects
    rid2 = client.post("/api/v1/tracker/runs", json={"topic": "t", "k": 3}, headers=h2).json()["id"]
    steal = client.post(
        f"/api/v1/tracker/runs/{rid2}/finish", json={"status": "complete", "developments": [_dev("x", 1, dev_id)]}, headers=h2
    )
    assert steal.status_code == 404
    assert client.post(f"/api/v1/tracker/runs/{rid}/finish", json={"status": "complete"}, headers=h2).status_code == 404
    # reset by user 2 leaves user 1's data alone
    client.delete("/api/v1/tracker/state", headers=h2)
    assert client.get(f"/api/v1/tracker/runs/{rid}", headers=h1).status_code == 200


def test_script_urls_are_rejected_and_markup_stays_text(client, creds):
    h = _auth(client, creds)
    rid = client.post("/api/v1/tracker/runs", json={"topic": "t", "k": 3}, headers=h).json()["id"]
    bad = _dev("evil", 1, url="javascript:alert(1)")
    r = client.post(f"/api/v1/tracker/runs/{rid}/finish", json={"status": "complete", "developments": [bad]}, headers=h)
    assert r.status_code == 400
    # a guardrail-rejected URL is still recorded (as inert text), so the run can be saved
    rejected = _article("javascript:alert(1)", "rejected", "scheme 'javascript' is not allowed")
    r = client.post(f"/api/v1/tracker/runs/{rid}/finish", json={"status": "partial", "articles": [rejected]}, headers=h)
    assert r.status_code == 200 and r.json()["article_counts"]["rejected"] == 1
    arts = client.get(f"/api/v1/tracker/runs/{rid}/articles", headers=h).json()
    assert arts[0]["url"] == "javascript:alert(1)" and arts[0]["status"] == "rejected"
    rid = client.post("/api/v1/tracker/runs", json={"topic": "t", "k": 3}, headers=h).json()["id"]
    # markup in text fields is stored verbatim (the frontend renders it as text)
    xss = '<script>alert("x")</script><img src=x onerror=alert(1)>'
    dev = _dev("t", 1)
    dev["title"] = xss
    r = client.post(f"/api/v1/tracker/runs/{rid}/finish", json={"status": "complete", "developments": [dev]}, headers=h)
    assert r.status_code == 200
    assert r.json()["developments"][0]["title"] == xss


def test_partial_run_without_developments_keeps_previous_top_k(client, creds):
    h = _auth(client, creds)
    _, r1 = _run(client, h, [_dev("A", 1)])
    aid = r1.json()["developments"][0]["id"]
    _, r2 = _run(client, h, [], [_article("https://example.com/z", "rejected", "private address")], status="partial")
    assert r2.json()["status"] == "partial" and r2.json()["article_counts"]["rejected"] == 1
    assert client.get("/api/v1/tracker/state", headers=h).json()["last_topk"][0]["development_id"] == aid
    assert client.get("/api/v1/tracker/runs/latest", headers=h).json()["status"] == "partial"


def test_reset_clears_everything(client, creds):
    h = _auth(client, creds)
    _run(client, h, [_dev("A", 1)], [_article("https://example.com/a")])
    assert client.delete("/api/v1/tracker/state", headers=h).status_code == 200
    st = client.get("/api/v1/tracker/state", headers=h).json()
    assert st == {"seen_urls": [], "developments": [], "last_topk": [], "last_run_id": None}
    assert client.get("/api/v1/tracker/runs", headers=h).json() == []


def test_report_can_be_attached_only_by_owner(client, creds):
    h1 = _auth(client, creds)
    rid, _ = _run(client, h1, [_dev("A", 1)])
    assert client.put(f"/api/v1/tracker/runs/{rid}/report", json={"report_md": "# hello"}, headers=h1).status_code == 200
    assert client.get(f"/api/v1/tracker/runs/{rid}", headers=h1).json()["report_md"] == "# hello"
    h2 = _auth(client, {"email": "other-report@example.com", "password": "Sup3rSecret!", "pin": "4821"})
    assert client.put(f"/api/v1/tracker/runs/{rid}/report", json={"report_md": "pwned"}, headers=h2).status_code == 404
