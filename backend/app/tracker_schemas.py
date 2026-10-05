"""Request/response models for the competitor tracker.

Everything the agent sends originates from untrusted web pages, so text is
stripped of control characters and length-capped here, and every URL must be
plain http(s) (a `javascript:` URL stored here would become an XSS link).
"""
import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean(v: str) -> str:
    return _CONTROL.sub("", v).strip()


def _http_url(v: str) -> str:
    v = _clean(v)
    if not re.match(r"^https?://[^\s<>\"']+$", v, re.IGNORECASE) or len(v) > 2048:
        raise ValueError("Must be an http(s) URL")
    return v


Text = Annotated[str, AfterValidator(_clean)]
HttpUrl = Annotated[str, AfterValidator(_http_url)]


class SourceIn(BaseModel):
    url: HttpUrl
    title: Text = Field(default="", max_length=300)
    quote: Text = Field(default="", max_length=2000)


class DevelopmentIn(BaseModel):
    existing_id: int | None = None
    title: Text = Field(min_length=1, max_length=200)
    summary: Text = Field(min_length=1, max_length=4000)
    rank: int = Field(ge=1, le=50)
    sources: list[SourceIn] = Field(min_length=1, max_length=12)


class ArticleIn(BaseModel):
    # Any string: guardrail-rejected URLs (file://, javascript:, http://127.0.0.1...) must be recorded too.
    # They are stored as inert text and the frontend only makes http(s) URLs clickable.
    url: Text = Field(min_length=1, max_length=2048)
    canonical_url: Text = Field(min_length=1, max_length=2048)
    title: Text = Field(default="", max_length=300)
    status: Literal["fetched", "skipped", "rejected", "failed"]
    reason: Text | None = Field(default=None, max_length=300)
    content_hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    fetched_at: datetime | None = None


class RunStart(BaseModel):
    topic: Text = Field(min_length=1, max_length=300)
    k: int = Field(ge=1, le=50)


class ReportBody(BaseModel):
    report_md: Text = Field(max_length=200_000)


class RunFinish(BaseModel):
    status: Literal["complete", "partial", "failed"]
    partial_reason: Text | None = Field(default=None, max_length=300)
    report_md: Text = Field(default="", max_length=200_000)
    stats: dict = Field(default_factory=dict)
    articles: list[ArticleIn] = Field(default_factory=list, max_length=300)
    developments: list[DevelopmentIn] = Field(default_factory=list, max_length=50)


# ---- responses -------------------------------------------------------------


class SourceOut(BaseModel):
    url: str
    title: str
    quote: str


class DevelopmentOut(BaseModel):
    id: int
    title: str
    summary: str
    sources: list[SourceOut]


class SeenUrl(BaseModel):
    canonical_url: str
    title: str
    content_hash: str | None
    fetched_at: datetime


class LastTopK(BaseModel):
    development_id: int
    rank: int


class StateOut(BaseModel):
    seen_urls: list[SeenUrl]
    developments: list[DevelopmentOut]
    last_topk: list[LastTopK]
    last_run_id: int | None


class RunCreated(BaseModel):
    id: int


class RankedDevelopment(BaseModel):
    id: int
    rank: int
    section: Literal["new", "still"]
    title: str
    summary: str
    sources: list[SourceOut]


class DroppedDevelopment(BaseModel):
    id: int
    title: str
    summary: str = ""


class RunSummary(BaseModel):
    id: int
    started_at: datetime
    finished_at: datetime | None
    status: str
    partial_reason: str | None
    topic: str
    k: int
    stats: dict
    new_count: int
    still_count: int
    dropped_count: int
    article_counts: dict[str, int]


class RunDetail(RunSummary):
    report_md: str
    developments: list[RankedDevelopment]
    dropped: list[DroppedDevelopment]


class ArticleOut(BaseModel):
    id: int
    url: str
    title: str
    status: str
    reason: str | None
    fetched_at: datetime
