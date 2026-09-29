import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

CATEGORIES = ("personal", "medical", "work", "finance", "travel", "code", "other")
COLORS = ("ember", "amber", "cream", "copper", "rust", "noir")

Category = Literal["personal", "medical", "work", "finance", "travel", "code", "other"]
Color = Literal["ember", "amber", "cream", "copper", "rust", "noir"]

_PIN_RE = re.compile(r"^\d{4}$")
_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")


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


def _check_username(v: str) -> str:
    v = v.strip()
    if not _USERNAME_RE.match(v):
        raise ValueError("Username must be 3-32 characters: letters, numbers, dot, dash or underscore")
    if "@" in v:
        raise ValueError("Username cannot contain @")
    return v


def _blank_to_none(v: object) -> object:
    return v.strip() or None if isinstance(v, str) else v


# ---------- Auth ----------
class RegisterRequest(BaseModel):
    """Email and/or username + password. The 4-digit vault PIN is optional
    here (the web form asks for it; API clients can set it later)."""

    email: EmailStr | None = None
    username: str | None = None
    password: str = Field(max_length=128)
    pin: str | None = None

    strip_blanks = field_validator("email", "username", "pin", mode="before")(_blank_to_none)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _check_password(v)

    @field_validator("username")
    @classmethod
    def _user(cls, v: str | None) -> str | None:
        return _check_username(v) if v is not None else None

    @field_validator("pin")
    @classmethod
    def _pin(cls, v: str | None) -> str | None:
        return _check_pin(v) if v is not None else None

    @model_validator(mode="after")
    def _need_identity(self) -> "RegisterRequest":
        if not self.email and not self.username:
            raise ValueError("Provide an email or a username")
        return self


class LoginRequest(BaseModel):
    """Log in with an email or a username. Any of the three keys works."""

    email: str | None = None
    username: str | None = None
    identifier: str | None = None
    password: str = Field(min_length=1, max_length=128)

    strip_blanks = field_validator("email", "username", "identifier", mode="before")(_blank_to_none)

    @model_validator(mode="after")
    def _need_identity(self) -> "LoginRequest":
        if not (self.identifier or self.email or self.username):
            raise ValueError("Provide an email or a username")
        return self

    @property
    def login_id(self) -> str:
        return (self.identifier or self.email or self.username or "").strip()


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=10)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr | None
    username: str | None
    has_password: bool
    has_pin: bool
    google_linked: bool
    google_picture: str | None = None
    created_at: datetime


class AuthResponse(BaseModel):
    """`token` and `access_token` carry the same JWT (two common spellings)."""

    user: UserOut
    token: str
    access_token: str
    token_type: str = "bearer"


class UserUpdate(BaseModel):
    """PATCH /api/users/:id. Send only the fields you want to change."""

    model_config = ConfigDict(extra="forbid")

    email: EmailStr | None = None
    username: str | None = None
    password: str | None = Field(default=None, max_length=128)
    current_password: str | None = None

    strip_blanks = field_validator("email", "username", mode="before")(_blank_to_none)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str | None) -> str | None:
        return _check_password(v) if v is not None else None

    @field_validator("username")
    @classmethod
    def _user(cls, v: str | None) -> str | None:
        return _check_username(v) if v is not None else None

    @model_validator(mode="after")
    def _something(self) -> "UserUpdate":
        if self.email is None and self.username is None and self.password is None:
            raise ValueError("Nothing to update: send email, username and/or password")
        return self


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
    # The account's email or username, typed again to confirm.
    confirm_email: str = Field(min_length=1, max_length=320)

    @field_validator("confirm_email", mode="before")
    @classmethod
    def _strip_email(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


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
    color: Color = "ember"
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
    message_count: int
    is_sample: bool
    created_at: datetime
    updated_at: datetime


class ChatListResponse(BaseModel):
    chats: list[ChatOut]


# ---------- LLM ----------
class HistoryTurn(BaseModel):
    """One earlier turn of the current session, held only by the client."""

    role: Literal["user", "model"]
    text: str = Field(min_length=1, max_length=32000)


class ExecuteRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=16000)
    card_id: int | None = None
    # Continue an existing session: the client re-sends the transcript it holds
    # in memory. The server forwards it to Gemini and never stores it.
    chat_id: int | None = None
    history: list[HistoryTurn] = Field(default_factory=list, max_length=60)
    title: str | None = Field(default=None, max_length=120)
    tags: list[str] = Field(default_factory=list, max_length=6)

    @field_validator("history")
    @classmethod
    def _cap_history(cls, v: list[HistoryTurn]) -> list[HistoryTurn]:
        if sum(len(t.text) for t in v) > 120_000:
            raise ValueError("Conversation is too long; start a new chat")
        return v

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
