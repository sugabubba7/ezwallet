from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Either may be empty, but never both (enforced at registration).
    email: Mapped[str | None] = mapped_column(String(320), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
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


# --------------------------------------------------------------------------
# Competitor tracker (assignment 1B). The agent is a client of the API: it
# loads this state at the start of a run and writes it back at the end.
# Every row is owned by a user; every query filters on user_id.
# --------------------------------------------------------------------------


class TrackerRun(Base):
    __tablename__ = "tracker_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="running")  # running|complete|partial|failed
    partial_reason: Mapped[str | None] = mapped_column(String(300))
    topic: Mapped[str] = mapped_column(String(300))
    k: Mapped[int] = mapped_column(Integer)
    report_md: Mapped[str] = mapped_column(Text, default="")
    stats: Mapped[dict] = mapped_column(JSON, default=dict)  # steps, fetches, tokens, cost, ...
    changes: Mapped[dict] = mapped_column(JSON, default=dict)  # new / still / dropped


class TrackerDevelopment(Base):
    """A real-world development the agent has reported. Many URLs can support one."""

    __tablename__ = "tracker_developments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text)
    first_run_id: Mapped[int | None] = mapped_column(ForeignKey("tracker_runs.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sources: Mapped[list["TrackerSource"]] = relationship(
        back_populates="development", cascade="all, delete-orphan", passive_deletes=True
    )


class TrackerSource(Base):
    """One URL that supports a development, with the passage that proves it."""

    __tablename__ = "tracker_sources"
    __table_args__ = (UniqueConstraint("development_id", "url", name="uq_tracker_source_dev_url"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    development_id: Mapped[int] = mapped_column(
        ForeignKey("tracker_developments.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(2048))
    title: Mapped[str] = mapped_column(String(300), default="")
    quote: Mapped[str] = mapped_column(Text, default="")
    run_id: Mapped[int | None] = mapped_column(ForeignKey("tracker_runs.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    development: Mapped[TrackerDevelopment] = relationship(back_populates="sources")


class TrackerArticle(Base):
    """Every fetch attempt of a run: fetched, skipped as already seen, or rejected."""

    __tablename__ = "tracker_articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("tracker_runs.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(2048))
    canonical_url: Mapped[str] = mapped_column(String(2048), index=True)
    title: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(16))  # fetched|skipped|rejected
    reason: Mapped[str | None] = mapped_column(String(300))
    content_hash: Mapped[str | None] = mapped_column(String(64))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TrackerTopK(Base):
    """The ranked top K of one run (what 'last time' means for the next run)."""

    __tablename__ = "tracker_topk"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("tracker_runs.id", ondelete="CASCADE"), index=True)
    development_id: Mapped[int] = mapped_column(
        ForeignKey("tracker_developments.id", ondelete="CASCADE"), index=True
    )
    rank: Mapped[int] = mapped_column(Integer)
    section: Mapped[str] = mapped_column(String(8))  # new|still
    summary: Mapped[str] = mapped_column(Text)
