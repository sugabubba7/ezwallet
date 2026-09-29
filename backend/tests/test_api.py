import httpx
import pytest
from sqlalchemy import select

from app import gemini
from app.database import SessionLocal
from app.models import User, WalletCard
from app.security import SESSION_COOKIE


# ---------------- Auth ----------------
def test_register_returns_201_and_sets_httponly_cookie(client, creds):
    r = client.post("/api/v1/auth/register", json=creds)
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["email"] == creds["email"]
    assert body["user"]["has_pin"] is True
    assert body["token_type"] == "bearer"
    assert "httponly" in r.headers["set-cookie"].lower()


def test_password_and_pin_are_argon2id_hashed(registered):
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == registered["email"]))
        assert u.password_hash.startswith("$argon2id$")
        assert u.pin_hash.startswith("$argon2id$")
        assert registered["password"] not in u.password_hash


def test_register_duplicate_email_409(client, registered):
    r = client.post("/api/v1/auth/register", json=registered)
    assert r.status_code == 409


@pytest.mark.parametrize(
    "patch",
    [{"email": "not-an-email"}, {"password": "short1"}, {"password": "nodigitshere"}, {"pin": "12a4"}, {"pin": "12345"}],
)
def test_register_validation_400(client, creds, patch):
    r = client.post("/api/v1/auth/register", json={**creds, **patch})
    assert r.status_code == 400
    assert "detail" in r.json()


def test_login_ok_and_wrong_password(client, registered):
    ok = client.post("/api/v1/auth/login", json={"email": registered["email"], "password": registered["password"]})
    assert ok.status_code == 200
    assert ok.json()["access_token"]
    bad = client.post("/api/v1/auth/login", json={"email": registered["email"], "password": "Wrong1234"})
    assert bad.status_code == 401
    nouser = client.post("/api/v1/auth/login", json={"email": "ghost@example.com", "password": "Whatever1"})
    assert nouser.status_code == 401


def test_me_requires_auth(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_bearer_token_works_without_cookie(client, registered):
    token = client.post("/api/v1/auth/login", json={"email": registered["email"], "password": registered["password"]}).json()["access_token"]
    client.cookies.clear()
    assert client.get("/api/v1/auth/me").status_code == 401
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200


def test_logout_clears_session(client, registered):
    assert client.post("/api/v1/auth/logout").status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def test_google_not_configured_400(client):
    r = client.post("/api/v1/auth/google", json={"credential": "x" * 40})
    assert r.status_code == 400


# ---------------- Wallet ----------------
def test_locked_card_list_hides_content(client, registered):
    r = client.get("/api/v1/wallet/cards")
    assert r.status_code == 200
    body = r.json()
    assert body["locked"] is True
    assert len(body["cards"]) == 3
    assert all("content" not in c for c in body["cards"])


def test_cards_encrypted_at_rest(registered):
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == registered["email"]))
        card = db.scalar(select(WalletCard).where(WalletCard.user_id == u.id))
        assert b"penicillin" not in card.content_encrypted and b"warm" not in card.content_encrypted
        assert card.content_encrypted.startswith(b"gAAAAA")  # Fernet token


def test_unlock_flow(client, registered):
    assert client.get("/api/v1/wallet/cards/revealed").status_code == 401
    bad = client.post("/api/v1/wallet/unlock", json={"pin": "0000"})
    assert bad.status_code == 401
    ok = client.post("/api/v1/wallet/unlock", json={"pin": registered["pin"]})
    assert ok.status_code == 200
    assert all(c["content"] for c in ok.json()["cards"])
    assert client.get("/api/v1/wallet/cards").json()["locked"] is False
    assert client.get("/api/v1/wallet/cards/revealed").status_code == 200
    assert client.post("/api/v1/wallet/lock").status_code == 200
    assert client.get("/api/v1/wallet/cards/revealed").status_code == 401


def test_pin_lockout_after_max_attempts(client, registered):
    for _ in range(5):
        assert client.post("/api/v1/wallet/unlock", json={"pin": "0000"}).status_code == 401
    r = client.post("/api/v1/wallet/unlock", json={"pin": registered["pin"]})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_card_crud(client, registered):
    new = {"label": "API keys", "category": "code", "color": "copper", "content": "sk-demo-123"}
    assert client.post("/api/v1/wallet/cards", json=new).status_code == 401  # locked
    client.post("/api/v1/wallet/unlock", json={"pin": registered["pin"]})
    r = client.post("/api/v1/wallet/cards", json=new)
    assert r.status_code == 201
    card = r.json()
    assert card["content"] == "sk-demo-123" and card["position"] == 3
    r = client.put(f"/api/v1/wallet/cards/{card['id']}", json={"content": "sk-demo-456"})
    assert r.status_code == 200 and r.json()["content"] == "sk-demo-456"
    assert client.post("/api/v1/wallet/cards", json={**new, "color": "neon"}).status_code == 400
    assert client.delete(f"/api/v1/wallet/cards/{card['id']}").status_code == 200
    assert client.delete(f"/api/v1/wallet/cards/{card['id']}").status_code == 404


def test_cannot_touch_other_users_card(client, registered, creds):
    client.post("/api/v1/wallet/unlock", json={"pin": registered["pin"]})
    victim_card = client.get("/api/v1/wallet/cards").json()["cards"][0]["id"]
    client.cookies.clear()
    other = {"email": "other-" + creds["email"], "password": "An0therPass", "pin": "1111"}
    client.post("/api/v1/auth/register", json=other)
    client.post("/api/v1/wallet/unlock", json={"pin": "1111"})
    assert client.put(f"/api/v1/wallet/cards/{victim_card}", json={"label": "pwned"}).status_code == 404
    assert client.delete(f"/api/v1/wallet/cards/{victim_card}").status_code == 404


# ---------------- Chats ----------------
def test_chats_list_and_delete(client, registered):
    chats = client.get("/api/v1/chats").json()["chats"]
    assert len(chats) == 5 and all(c["is_sample"] for c in chats)
    cid = chats[0]["id"]
    assert client.get(f"/api/v1/chats/{cid}").status_code == 200
    assert client.delete(f"/api/v1/chats/{cid}").status_code == 200
    assert client.get(f"/api/v1/chats/{cid}").status_code == 404


# ---------------- LLM proxy ----------------
@pytest.fixture
def fake_gemini(monkeypatch):
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["headers"] = dict(request.headers)
        seen["body"] = request.content.decode()
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": "Hello from Gemini"}]}}],
                "usageMetadata": {"promptTokenCount": 12, "candidatesTokenCount": 4},
            },
        )

    real_client = httpx.Client
    monkeypatch.setattr(gemini.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    return seen


def test_execute_with_card_stores_metadata_only(client, registered, fake_gemini):
    client.post("/api/v1/wallet/unlock", json={"pin": registered["pin"]})
    card = next(c for c in client.get("/api/v1/wallet/cards/revealed").json() if c["label"] == "Health Notes")
    r = client.post(
        "/api/v1/llm/execute",
        json={"prompt": "What should I ask my doctor?", "card_id": card["id"], "title": "Doctor prep", "tags": ["health"]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["output"] == "Hello from Gemini"
    assert body["retention"] == "none"
    assert r.headers["cache-control"] == "no-store"
    # Context was sent upstream, key went in a header and not the URL.
    assert "penicillin" in fake_gemini["body"]
    assert fake_gemini["headers"]["x-goog-api-key"] == "test-gemini-key"
    assert "key=" not in fake_gemini["url"]
    assert "generativelanguage.googleapis.com" in fake_gemini["url"]
    # Only metadata persisted.
    chat = body["chat"]
    assert chat["title"] == "Doctor prep" and chat["card_label"] == "Health Notes"
    assert chat["prompt_tokens"] == 12 and "medical" in chat["tags"]
    assert chat["message_count"] == 2
    assert "prompt" not in chat and "output" not in chat


def test_execute_with_card_requires_unlocked_vault(client, registered, fake_gemini):
    cid = client.get("/api/v1/wallet/cards").json()["cards"][0]["id"]
    r = client.post("/api/v1/llm/execute", json={"prompt": "hi", "card_id": cid})
    assert r.status_code == 401


def test_execute_unknown_card_404(client, registered, fake_gemini):
    client.post("/api/v1/wallet/unlock", json={"pin": registered["pin"]})
    assert client.post("/api/v1/llm/execute", json={"prompt": "hi", "card_id": 999999}).status_code == 404


def test_execute_without_card_and_unauthenticated(client, registered, fake_gemini):
    assert client.post("/api/v1/llm/execute", json={"prompt": "hi"}).status_code == 200
    client.cookies.clear()
    assert client.post("/api/v1/llm/execute", json={"prompt": "hi"}).status_code == 401


def test_execute_not_configured_503(client, registered, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "gemini_api_key", None)
    assert client.post("/api/v1/llm/execute", json={"prompt": "hi"}).status_code == 503


# ---------------- Account ----------------
def test_change_email(client, registered, creds):
    new_email = "new-" + registered["email"]
    r = client.put("/api/v1/account/email", json={"new_email": new_email, "current_password": "wrong"})
    assert r.status_code == 401
    r = client.put("/api/v1/account/email", json={"new_email": new_email, "current_password": registered["password"]})
    assert r.status_code == 200 and r.json()["email"] == new_email
    client.cookies.clear()
    assert client.post("/api/v1/auth/login", json={"email": new_email, "password": registered["password"]}).status_code == 200


def test_change_password_invalidates_old_tokens(client, registered):
    old_token = client.cookies.get(SESSION_COOKIE)
    r = client.put("/api/v1/account/password", json={"current_password": registered["password"], "new_password": "Brand9NewPass"})
    assert r.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 200  # this browser re-issued
    client.cookies.clear()
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": registered["email"], "password": "Brand9NewPass"}).status_code == 200


def test_change_pin(client, registered):
    r = client.put("/api/v1/account/pin", json={"current_password": registered["password"], "new_pin": "9999"})
    assert r.status_code == 200
    assert client.post("/api/v1/wallet/unlock", json={"pin": registered["pin"]}).status_code == 401
    assert client.post("/api/v1/wallet/unlock", json={"pin": "9999"}).status_code == 200


def test_delete_account(client, registered):
    r = client.request("DELETE", "/api/v1/account", json={"current_password": registered["password"], "confirm_email": "x@y.com"})
    assert r.status_code == 400
    r = client.request("DELETE", "/api/v1/account", json={"current_password": registered["password"], "confirm_email": registered["email"]})
    assert r.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401
    with SessionLocal() as db:
        assert db.scalar(select(User).where(User.email == registered["email"])) is None
        assert db.scalar(select(WalletCard).join(User, isouter=True).where(User.id.is_(None))) is None


def test_execute_continues_session_and_counts_messages(client, registered, fake_gemini):
    first = client.post("/api/v1/llm/execute", json={"prompt": "Plan a trip to Lisbon", "title": "Lisbon"}).json()["chat"]
    assert first["message_count"] == 2
    history = [{"role": "user", "text": "Plan a trip to Lisbon"}, {"role": "model", "text": "Hello from Gemini"}]
    r = client.post(
        "/api/v1/llm/execute",
        json={"prompt": "Add a day trip", "chat_id": first["id"], "history": history},
    )
    assert r.status_code == 200, r.text
    chat = r.json()["chat"]
    assert chat["id"] == first["id"] and chat["message_count"] == 4 and chat["title"] == "Lisbon"
    # Transcript is forwarded upstream in order (user, model, user)...
    import json as _json
    sent = _json.loads(fake_gemini["body"])["contents"]
    assert [c["role"] for c in sent] == ["user", "model", "user"]
    # ...and the continued session moves to the front of the archive.
    assert client.get("/api/v1/chats").json()["chats"][0]["id"] == first["id"]


def test_execute_continue_errors(client, registered, fake_gemini):
    sample = client.get("/api/v1/chats").json()["chats"][0]
    assert sample["is_sample"] and sample["message_count"] > 2
    assert client.post("/api/v1/llm/execute", json={"prompt": "hi", "chat_id": sample["id"]}).status_code == 400
    assert client.post("/api/v1/llm/execute", json={"prompt": "hi", "chat_id": 999999}).status_code == 404
    bad_role = {"prompt": "hi", "history": [{"role": "system", "text": "x"}]}
    assert client.post("/api/v1/llm/execute", json=bad_role).status_code == 400


def test_delete_account_tolerates_whitespace_in_confirmation(client, registered):
    r = client.request(
        "DELETE", "/api/v1/account",
        json={"current_password": registered["password"], "confirm_email": f"  {registered['email'].upper()} "},
    )
    assert r.status_code == 200, r.text
    assert client.get("/api/v1/auth/me").status_code == 401
