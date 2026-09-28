import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

CATEGORIES = ("personal", "medical", "work", "finance", "travel", "code", "other")
COLORS = ("sapphire", "ivory", "peach", "mint", "lilac", "graphite")

Category = Literal["personal", "medical", "work", "finance", "travel", "code", "other"]
Color = Literal["sapphire", "ivory", "peach", "mint", "lilac", "graphite"]

_PIN_RE = re.compile(r"^\d{4}$")


def _check_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError("Password must contain at least one letter and one number")
    return v


def _check_pin(v: str) -> str:
    if not _PIN_RE.match(v):
        raise ValueError("PIN must be exactly 4 digits")
    return v


# ---------- Auth ----------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    pin: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)

    @field_validator("pin")
    @classmethod
    def _pin(cls, v: str) -> str:
        return _check_pin(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=10)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    has_password: bool
    has_pin: bool
    google_linked: bool
    google_picture: str | None = None
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserOut
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str


# ---------- Account ----------
class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str | None = None  # optional only for Google-only accounts
    new_password: str = Field(max_length=128)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)


class ChangePinRequest(BaseModel):
    current_password: str | None = None
    new_pin: str

    @field_validator("new_pin")
    @classmethod
    def _pin(cls, v: str) -> str:
        return _check_pin(v)


class DeleteAccountRequest(BaseModel):
    current_password: str | None = None
    confirm_email: EmailStr


# ---------- Wallet ----------
class UnlockRequest(BaseModel):
    pin: str

    @field_validator("pin")
    @classmethod
    def _pin(cls, v: str) -> str:
        return _check_pin(v)


class CardCreate(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    category: Category = "personal"
    color: Color = "sapphire"
    content: str = Field(min_length=1, max_length=4000)


class CardUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    category: Category | None = None
    color: Color | None = None
    content: str | None = Field(default=None, min_length=1, max_length=4000)


class CardMeta(BaseModel):
    """Card as seen while the vault is LOCKED: no sensitive content."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    category: str
    color: str
    position: int
    created_at: datetime


class CardRevealed(CardMeta):
    content: str


class CardListResponse(BaseModel):
    cards: list[CardMeta]
    locked: bool


class UnlockResponse(BaseModel):
    cards: list[CardRevealed]
    expires_in_seconds: int


# ---------- Chats ----------
class ChatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    model: str
    tags: list[str]
    card_label: str | None
    prompt_tokens: int | None
    output_tokens: int | None
    latency_ms: int | None
    is_sample: bool
    created_at: datetime


class ChatListResponse(BaseModel):
    chats: list[ChatOut]


# ---------- LLM ----------
class ExecuteRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=16000)
    card_id: int | None = None
    title: str | None = Field(default=None, max_length=120)
    tags: list[str] = Field(default_factory=list, max_length=6)

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for t in v:
            t = t.strip()[:24]
            if t and t.lower() not in (x.lower() for x in out):
                out.append(t)
        return out


class ExecuteResponse(BaseModel):
    output: str
    model: str
    chat: ChatOut
    retention: str = "none"


class LlmStatus(BaseModel):
    configured: bool
    model: str
    endpoint: str
