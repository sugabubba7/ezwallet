from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import clear_auth_cookies, get_current_user, set_session_cookie, to_user_out
from ..models import User
from ..schemas import AuthResponse, GoogleAuthRequest, LoginRequest, MessageResponse, RegisterRequest, UserOut
from ..security import burn_hash_time, create_access_token, hash_secret, verify_secret
from ..seed import seed_user

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _issue(response: Response, user: User) -> AuthResponse:
    token = create_access_token(user.id, user.token_version)
    set_session_cookie(response, token)
    return AuthResponse(user=to_user_out(user), access_token=token)


def _find_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)) -> AuthResponse:
    email = body.email.lower()
    if _find_by_email(db, email):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An account with this email already exists")
    user = User(email=email, password_hash=hash_secret(body.password), pin_hash=hash_secret(body.pin))
    db.add(user)
    if get_settings().seed_demo_data:
        seed_user(db, user, get_settings().gemini_model)
    db.commit()
    return _issue(response, user)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)) -> AuthResponse:
    user = _find_by_email(db, body.email)
    if not user:
        burn_hash_time(body.password)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.password_hash:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "This account uses Google sign-in. Log in with Google or set a password from Account settings.",
        )
    if not verify_secret(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return _issue(response, user)


@router.post("/google", response_model=AuthResponse)
def google_auth(
    body: GoogleAuthRequest, response: Response, db: Session = Depends(get_db)
) -> AuthResponse:
    """Verify a Google Identity Services ID token, then sign in / sign up.

    Returns 201 when a new account was created, 200 for an existing one.
    """
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Google sign-in is not configured on this server")

    from google.auth.transport import requests as g_requests
    from google.oauth2 import id_token

    try:
        info = id_token.verify_oauth2_token(body.credential, g_requests.Request(), settings.google_client_id)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google credential")
    if not info.get("email") or not info.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google account email is not verified")

    sub, email = info["sub"], info["email"].lower()
    user = db.scalar(select(User).where(User.google_sub == sub)) or _find_by_email(db, email)
    if user and user.google_sub and user.google_sub != sub:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This email is linked to a different Google account")
    created = user is None
    if created:
        user = User(email=email)
        db.add(user)
        if settings.seed_demo_data:
            seed_user(db, user, settings.gemini_model)
    user.google_sub = sub
    user.google_picture = info.get("picture")
    db.commit()

    result = _issue(response, user)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return result


@router.post("/logout", response_model=MessageResponse)
def logout(response: Response) -> MessageResponse:
    clear_auth_cookies(response)
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return to_user_out(user)
