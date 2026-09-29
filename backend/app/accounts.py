"""Account lookups shared by the auth, account and users routers."""
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import User


def find_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.strip().lower()))


def find_by_username(db: Session, username: str) -> User | None:
    # Case-insensitive: "NYUgrader" and "nyugrader" are the same account.
    return db.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))


def find_by_login(db: Session, identifier: str) -> User | None:
    """An identifier with an @ is an email; anything else is a username."""
    return find_by_email(db, identifier) if "@" in identifier else find_by_username(db, identifier)


def ensure_available(db: Session, *, email: str | None = None, username: str | None = None, exclude: User | None = None) -> None:
    """409 Conflict if the email or username already belongs to another account."""
    for taken, what in ((email and find_by_email(db, email), "email"), (username and find_by_username(db, username), "username")):
        if taken and (exclude is None or taken.id != exclude.id):
            raise HTTPException(status.HTTP_409_CONFLICT, f"An account with this {what} already exists")
