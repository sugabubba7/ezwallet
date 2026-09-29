from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import User
from .schemas import UserOut
from .security import SESSION_COOKIE, VAULT_COOKIE, decode_token

UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def _bearer(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Accepts a Bearer token (API clients) or the HTTP-only session cookie (browser).

    If an Authorization header is sent it is the ONLY credential considered:
    a bad bearer token is a 401 even when a valid cookie is also present, and
    a client juggling several accounts is never silently authenticated as
    whichever account last set a cookie.
    """
    if "authorization" in request.headers:
        token = _bearer(request)
    else:
        token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise UNAUTHORIZED
    payload = decode_token(token, "access")
    if not payload:
        raise UNAUTHORIZED
    try:
        user = db.get(User, int(payload["sub"]))
    except (KeyError, TypeError, ValueError):
        raise UNAUTHORIZED from None
    if not user or user.token_version != payload.get("ver"):
        raise UNAUTHORIZED
    return user


def vault_is_unlocked(request: Request, user: User) -> bool:
    token = request.cookies.get(VAULT_COOKIE) or request.headers.get("X-Vault-Token")
    if not token:
        return False
    payload = decode_token(token, "vault")
    return bool(
        payload and payload["sub"] == str(user.id) and payload.get("ver") == user.token_version
    )


def require_unlocked_vault(request: Request, user: User = Depends(get_current_user)) -> User:
    if not vault_is_unlocked(request, user):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Vault is locked. Enter your PIN to unlock.",
        )
    return user


def to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        has_password=user.password_hash is not None,
        has_pin=user.pin_hash is not None,
        google_linked=user.google_sub is not None,
        google_picture=user.google_picture,
        created_at=user.created_at,
    )


def _cookie_kwargs() -> dict:
    return {
        "httponly": True,
        "secure": get_settings().cookie_secure,
        "samesite": "lax",
        "path": "/",
    }


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE, token, max_age=get_settings().access_token_expire_minutes * 60, **_cookie_kwargs()
    )


def set_vault_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        VAULT_COOKIE, token, max_age=get_settings().vault_session_minutes * 60, **_cookie_kwargs()
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, **_cookie_kwargs())
    response.delete_cookie(VAULT_COOKIE, **_cookie_kwargs())
