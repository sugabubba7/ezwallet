from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from cryptography.fernet import Fernet, InvalidToken
from passlib.context import CryptContext

from .config import get_settings

# argon2id (passlib's argon2 default type is "ID"; set explicitly for clarity).
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto", argon2__type="ID")

SESSION_COOKIE = "ezw_session"
VAULT_COOKIE = "ezw_vault"


def hash_secret(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_secret(raw: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return pwd_context.verify(raw, hashed)
    except (ValueError, TypeError):
        return False


# Used to keep login timing constant when the email does not exist.
_DUMMY_HASH = pwd_context.hash("timing-equaliser-not-a-real-password")


def burn_hash_time(raw: str) -> None:
    pwd_context.verify(raw, _DUMMY_HASH)


def _encode(claims: dict[str, Any], minutes: int) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {**claims, "iat": now, "exp": now + timedelta(minutes=minutes)}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def create_access_token(user_id: int, token_version: int) -> str:
    return _encode(
        {"sub": str(user_id), "typ": "access", "ver": token_version},
        get_settings().access_token_expire_minutes,
    )


def create_vault_token(user_id: int, token_version: int) -> str:
    return _encode(
        {"sub": str(user_id), "typ": "vault", "ver": token_version},
        get_settings().vault_session_minutes,
    )


def decode_token(token: str, expected_type: str) -> dict[str, Any] | None:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != expected_type:
        return None
    return payload


def _fernet() -> Fernet:
    return Fernet(get_settings().wallet_encryption_key.encode())


def encrypt_text(plain: str) -> bytes:
    return _fernet().encrypt(plain.encode("utf-8"))


def decrypt_text(token: bytes) -> str:
    try:
        return _fernet().decrypt(token).decode("utf-8")
    except InvalidToken as exc:  # key rotated / corrupted row
        raise ValueError("Unable to decrypt wallet card") from exc
