"""/api/users/:id: read, update and delete a user (the assignment's contract).

Order of checks, identical for GET, PATCH and DELETE:
  1. authentication:  no / bad / expired token          -> 401
  2. ownership:       :id is not the caller's own id    -> 404
  3. only then:       parse + validate the request body -> 400 / 409

Why 404 and not 403 for someone else's :id: a 403 confirms that the account
exists ("it's there, you just can't touch it"), which lets anyone holding a
token walk the id space and count or probe accounts. A 404 says the same
thing for "not yours" and "doesn't exist", so nothing leaks. Step 2 runs
before step 3 so that a malformed body aimed at another user's id is still a
404, never a 400 that would hint the id is real.
"""
import json

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..accounts import ensure_available
from ..database import get_db
from ..deps import clear_auth_cookies, get_current_user, to_user_out
from ..models import User
from ..schemas import MessageResponse, UserOut, UserUpdate
from ..security import hash_secret, verify_secret

router = APIRouter(prefix="/api/users", tags=["users"])

NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "User not found")


def own_user(user_id: str, user: User = Depends(get_current_user)) -> User:
    # :id is taken as a string so "abc" or "999999" get the same 404 as
    # someone else's real id instead of a validation error.
    if user_id.strip() != str(user.id):
        raise NOT_FOUND
    return user


@router.get("/{user_id}", response_model=UserOut)
def read_user(user: User = Depends(own_user)) -> UserOut:
    return to_user_out(user)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(request: Request, user: User = Depends(own_user), db: Session = Depends(get_db)) -> UserOut:
    """Change email, username and/or password. `current_password` is checked
    when supplied; a valid bearer token for this account is the authority."""
    try:
        body = UserUpdate.model_validate(json.loads(await request.body() or b"null"))
    except json.JSONDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Body must be valid JSON") from None
    except ValidationError as exc:
        err = exc.errors()[0]
        field = ".".join(str(p) for p in err.get("loc", ()))
        msg = str(err.get("msg", "Invalid value")).removeprefix("Value error, ")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{field}: {msg}" if field else msg) from None

    if body.current_password is not None and not verify_secret(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")

    email = body.email.lower() if body.email else None
    ensure_available(db, email=email, username=body.username, exclude=user)
    if email:
        user.email = email
    if body.username:
        user.username = body.username
    if body.password:
        user.password_hash = hash_secret(body.password)
    db.commit()
    return to_user_out(user)


@router.delete("/{user_id}", response_model=MessageResponse)
def delete_user(response: Response, user: User = Depends(own_user), db: Session = Depends(get_db)) -> MessageResponse:
    db.delete(user)  # cascades to wallet cards and chat summaries
    db.commit()
    clear_auth_cookies(response)
    return MessageResponse(message="User deleted")
