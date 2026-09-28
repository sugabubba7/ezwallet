from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    # Nullable: Google-only accounts have no local password until they set one.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    pin_hash: Mapped[str | None] = mapped_column(String(255))
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    google_picture: Mapped[str | None] = mapped_column(String(1024))
    pin_failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    pin_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Bumped on password change / logout-everywhere so old JWTs stop working.
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    cards: Mapped[list["WalletCard"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    chats: Mapped[list["ChatSummary"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class WalletCard(Base):
    __tablename__ = "wallet_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(32), default="personal")
    color: Mapped[str] = mapped_column(String(32), default="ember")
    # Fernet ciphertext of the sensitive context. Never stored in plaintext.
    content_encrypted: Mapped[bytes] = mapped_column(LargeBinary)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="cards")


class ChatSummary(Base):
    """Metadata-only record of an LLM execution.

    Zero-data-retention: the prompt, the assembled context and the model
    output are NEVER persisted. Only user-supplied title/tags and technical
    metadata are stored.
    """

    __tablename__ = "chat_summaries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    model: Mapped[str] = mapped_column(String(64))
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    card_label: Mapped[str | None] = mapped_column(String(80))
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    # Total texts exchanged (user + model). A count, never the texts themselves.
    message_count: Mapped[int] = mapped_column(Integer, default=2, server_default="2")
    is_sample: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)  # last activity

    user: Mapped[User] = relationship(back_populates="chats")
