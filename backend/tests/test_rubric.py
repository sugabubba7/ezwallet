"""The assignment's contract, tested the way the grading script runs it:
one HTTP client registers two accounts, then exercises every endpoint in the
table with Bearer tokens and checks shapes, status codes and the three rules.
"""
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.config import get_settings

PW = "Courant2026!"
SECRETS = ("password_hash", "pin_hash", "$argon2", PW)


def assert_no_secrets(resp):
    """Rule 1: no password hash (or the password itself) in any response."""
    for s in SECRETS:
        assert s not in resp.text, f"{s!r} leaked in {resp.request.method} {resp.request.url}"


@pytest.fixture
def two_users(client, creds):
    """Register A and B with the SAME client, like a script using one session."""
    users = {}
    for tag, body in (
        ("a", {"email": "a-" + creds["email"], "password": PW}),         # email, no PIN
        ("b", {"username": "b_" + creds["email"].split("@")[0], "password": PW}),  # username only
    ):
        r = client.post("/api/auth/register", json=body)
        assert r.status_code == 201, r.text
        assert_no_secrets(r)
        data = r.json()
        assert data["token"] and data["token"] == data["access_token"]
        users[tag] = {"token": data["token"], "id": data["user"]["id"], "body": body}
    return users


def H(token):
    return {"Authorization": f"Bearer {token}"}


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_register_login_me_shapes(client, two_users):
    a, b = two_users["a"], two_users["b"]
    # login by email and by username
    for who, key in ((a, "email"), (b, "username")):
        r = client.post("/api/auth/login", json={key: who["body"][key], "password": PW})
        assert r.status_code == 200, r.text
        assert_no_secrets(r)
        assert set(r.json()) >= {"token", "access_token", "token_type", "user"}
        me = client.get("/api/auth/me", headers=H(r.json()["token"]))
        assert me.status_code == 200 and me.json()["id"] == who["id"]
        assert_no_secrets(me)
    # username login is case-insensitive
    r = client.post("/api/auth/login", json={"username": b["body"]["username"].upper(), "password": PW})
    assert r.status_code == 200


@pytest.mark.parametrize("body,code", [
    ({"password": PW}, 400),                                  # no email/username
    ({"email": "not-an-email", "password": PW}, 400),
    ({"email": "short@example.com", "password": "short1"}, 400),
    ({"username": "x", "password": PW}, 400),                  # too short
])
def test_register_rejects_bad_input(client, body, code):
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == code
    assert_no_secrets(r)
    assert "detail" in r.json()


def test_register_duplicate_is_409(client, two_users):
    for tag in ("a", "b"):
        r = client.post("/api/auth/register", json=two_users[tag]["body"])
        assert r.status_code == 409
        assert_no_secrets(r)


def test_login_failures_are_401_with_same_message(client, two_users):
    wrong_pw = client.post("/api/auth/login", json={"email": two_users["a"]["body"]["email"], "password": "Wrong12345"})
    no_user = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": PW})
    assert wrong_pw.status_code == no_user.status_code == 401
    assert wrong_pw.json() == no_user.json()  # no user enumeration
    assert_no_secrets(wrong_pw)


def _forge(sub, *, exp_delta, key=None, typ="access", ver=0):
    s = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(sub), "typ": typ, "ver": ver, "iat": now, "exp": now + exp_delta},
                      key or s.jwt_secret, algorithm=s.jwt_algorithm)


def test_rule2_missing_bad_or_expired_token_is_401(client, two_users):
    client.cookies.clear()  # rule 2 is about tokens; make sure no cookie rescues the request
    uid = two_users["a"]["id"]
    bad_tokens = {
        "none": {},
        "garbage": H("not-a-jwt"),
        "empty bearer": {"Authorization": "Bearer "},
        "wrong scheme": {"Authorization": f"Basic {two_users['a']['token']}"},
        "expired": H(_forge(uid, exp_delta=timedelta(minutes=-5))),
        "wrong signature": H(_forge(uid, exp_delta=timedelta(minutes=5), key="x" * 48)),
        "vault token used as access": H(_forge(uid, exp_delta=timedelta(minutes=5), typ="vault")),
    }
    targets = [("GET", "/api/auth/me"), ("GET", f"/api/users/{uid}"), ("PATCH", f"/api/users/{uid}"), ("DELETE", f"/api/users/{uid}")]
    for name, headers in bad_tokens.items():
        for method, path in targets:
            r = client.request(method, path, headers=headers, json={"email": "x@example.com"} if method == "PATCH" else None)
            assert r.status_code == 401, f"{name} {method} {path} -> {r.status_code}"
            assert_no_secrets(r)


def test_rule2_bad_bearer_is_401_even_with_valid_cookie(client, two_users):
    # the client still holds a valid session cookie from registering B
    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/auth/me", headers=H("garbage")).status_code == 401


def test_rule3_other_users_id_is_404_for_get_patch_delete(client, two_users):
    a, b = two_users["a"], two_users["b"]
    # NB: the client's cookie jar holds B's session (B registered last). A's
    # bearer token must win, so all three are refused, not served as B.
    for attacker, victim in ((a, b), (b, a)):
        path = f"/api/users/{victim['id']}"
        codes = {
            "GET": client.get(path, headers=H(attacker["token"])).status_code,
            "PATCH": client.patch(path, headers=H(attacker["token"]), json={"email": "pwned@example.com"}).status_code,
            "PATCH (bad body)": client.patch(path, headers=H(attacker["token"]), content=b"{not json").status_code,
            "DELETE": client.delete(path, headers=H(attacker["token"])).status_code,
        }
        assert set(codes.values()) == {404}, codes
    # nothing changed / nothing deleted
    for who in (a, b):
        me = client.get("/api/auth/me", headers=H(who["token"]))
        assert me.status_code == 200 and me.json().get("email") != "pwned@example.com"
    # unknown and non-numeric ids get the very same answer
    for path in ("/api/users/999999", "/api/users/abc"):
        assert client.get(path, headers=H(a["token"])).status_code == 404


def test_own_user_get_patch_delete(client, two_users):
    a = two_users["a"]
    path, hdr = f"/api/users/{a['id']}", H(a["token"])
    r = client.get(path, headers=hdr)
    assert r.status_code == 200 and r.json()["id"] == a["id"]
    assert_no_secrets(r)

    new_email = "renamed-" + a["body"]["email"]
    r = client.patch(path, headers=hdr, json={"email": new_email, "username": f"user{a['id']}x"})
    assert r.status_code == 200 and r.json()["email"] == new_email and r.json()["username"] == f"user{a['id']}x"
    assert_no_secrets(r)

    # password change: new password works, old one doesn't, token stays valid
    r = client.patch(path, headers=hdr, json={"password": "BrandNew2026!"})
    assert r.status_code == 200
    assert client.post("/api/auth/login", json={"email": new_email, "password": PW}).status_code == 401
    assert client.post("/api/auth/login", json={"email": new_email, "password": "BrandNew2026!"}).status_code == 200

    # validation and conflicts on your own id
    assert client.patch(path, headers=hdr, json={}).status_code == 400
    assert client.patch(path, headers=hdr, json={"email": "nope"}).status_code == 400
    assert client.patch(path, headers=hdr, json={"password": "x"}).status_code == 400
    assert client.patch(path, headers=hdr, json={"email": "a@b.co", "current_password": "wrong"}).status_code == 401
    assert client.patch(path, headers=hdr, json={"username": two_users["b"]["body"]["username"]}).status_code == 409

    r = client.delete(path, headers=hdr)
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=hdr).status_code == 401      # token of a deleted user
    assert client.get(path, headers=hdr).status_code == 401


def test_grader_account_is_seeded(monkeypatch):
    from app.accounts import find_by_username
    from app.database import SessionLocal
    from app.seed import ensure_grader_account
    from app.security import verify_secret

    s = get_settings()
    monkeypatch.setattr(s, "grader_username", "NYUgrader")
    monkeypatch.setattr(s, "grader_password", PW)
    ensure_grader_account()
    ensure_grader_account()  # idempotent
    with SessionLocal() as db:
        u = find_by_username(db, "nyugrader")
        assert u and u.username == "NYUgrader" and verify_secret(PW, u.password_hash)
        assert u.password_hash.startswith("$argon2id$")
