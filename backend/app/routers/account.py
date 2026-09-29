from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..accounts import ensure_available
from ..database import get_db
from ..deps import clear_auth_cookies, get_current_user, set_session_cookie, to_user_out
from ..models import User
from ..schemas import (
    ChangeEmailRequest,
    ChangePasswordRequest,
    ChangePinRequest,
    DeleteAccountRequest,
    MessageResponse,
    UserOut,
)
from ..security import create_access_token, hash_secret, verify_secret

router = APIRouter(prefix="/api/v1/account", tags=["account"])


def _require_password(user: User, supplied: str | None) -> None:
    """Accounts with a password must re-enter it for sensitive changes.

    Google-only accounts (no password yet) are already strongly authenticated
    by their session, so they may proceed without one.
    """
    if user.password_hash is None:
        return
    if not supplied or not verify_secret(supplied, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")


@router.get("", response_model=UserOut)
def get_account(user: User = Depends(get_current_user)) -> UserOut:
    return to_user_out(user)


@router.put("/email", response_model=UserOut)
def change_email(
    body: ChangeEmailRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> UserOut:
    _require_password(user, body.current_password)
    new_email = body.new_email.lower()
    if new_email == user.email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That is already your email")
    ensure_available(db, email=new_email, exclude=user)
    user.email = new_email
    db.commit()
    return to_user_out(user)


@router.put("/password", response_model=MessageResponse)
def change_password(
    body: ChangePasswordRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    _require_password(user, body.current_password)
    had_password = user.password_hash is not None
    user.password_hash = hash_secret(body.new_password)
    # Invalidate every other session and vault token, keep this browser signed in.
    user.token_version += 1
    db.commit()
    set_session_cookie(response, create_access_token(user.id, user.token_version))
    return MessageResponse(message="Password updated" if had_password else "Password set")


@router.put("/pin", response_model=MessageResponse)
def change_pin(
    body: ChangePinRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> MessageResponse:
    _require_password(user, body.current_password)
    had_pin = user.pin_hash is not None
    user.pin_hash = hash_secret(body.new_pin)
    user.pin_failed_attempts = 0
    user.pin_locked_until = None
    db.commit()
    return MessageResponse(message="Vault PIN updated" if had_pin else "Vault PIN set")


@router.delete("", response_model=MessageResponse)
def delete_account(
    body: DeleteAccountRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    _require_password(user, body.current_password)
    typed = body.confirm_email.lower()
    if typed not in {v.lower() for v in (user.email, user.username) if v}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Confirmation does not match your account email or username")
    db.delete(user)  # cascades to wallet cards and chat summaries
    db.commit()
    clear_auth_cookies(response)
    return MessageResponse(message="Account permanently deleted")
