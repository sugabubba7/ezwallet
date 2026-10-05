"""Competitor-tracker API (assignment 1B).

The tracker agent is a client of these endpoints: it loads its memory with
GET /state, opens a run, and writes the whole run back with POST /runs/{id}/finish.
The frontend reads the same data. Every endpoint requires a valid token (401
otherwise) and every query is scoped to the caller's user_id.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import (
    TrackerArticle,
    TrackerDevelopment,
    TrackerRun,
    TrackerSource,
    TrackerTopK,
    User,
    utcnow,
)
from ..schemas import MessageResponse
from ..tracker_schemas import (
    ArticleOut,
    DevelopmentOut,
    DroppedDevelopment,
    LastTopK,
    RankedDevelopment,
    ReportBody,
    RunCreated,
    RunDetail,
    RunFinish,
    RunStart,
    RunSummary,
    SeenUrl,
    SourceOut,
    StateOut,
)

router = APIRouter(prefix="/api/v1/tracker", tags=["tracker"])


def _owned_run(db: Session, user: User, run_id: int) -> TrackerRun:
    run = db.get(TrackerRun, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return run


def _dev_out(dev: TrackerDevelopment) -> DevelopmentOut:
    return DevelopmentOut(
        id=dev.id,
        title=dev.title,
        summary=dev.summary,
        sources=[SourceOut(url=s.url, title=s.title, quote=s.quote) for s in dev.sources],
    )


def _last_topk_rows(db: Session, user: User, before_run_id: int | None = None) -> tuple[int | None, list[TrackerTopK]]:
    """The top K of the most recent run (other than `before_run_id`) that has one."""
    q = (
        select(func.max(TrackerTopK.run_id))
        .join(TrackerRun, TrackerRun.id == TrackerTopK.run_id)
        .where(TrackerRun.user_id == user.id)
    )
    if before_run_id is not None:
        q = q.where(TrackerTopK.run_id != before_run_id)
    run_id = db.scalar(q)
    if run_id is None:
        return None, []
    rows = list(db.scalars(select(TrackerTopK).where(TrackerTopK.run_id == run_id).order_by(TrackerTopK.rank)))
    return run_id, rows


def _summary(db: Session, run: TrackerRun) -> RunSummary:
    counts = dict(
        db.execute(
            select(TrackerArticle.status, func.count()).where(TrackerArticle.run_id == run.id).group_by(TrackerArticle.status)
        ).all()
    )
    ch = run.changes or {}
    return RunSummary(
        id=run.id,
        started_at=run.started_at,
        finished_at=run.finished_at,
        status=run.status,
        partial_reason=run.partial_reason,
        topic=run.topic,
        k=run.k,
        stats=run.stats or {},
        new_count=len(ch.get("new", [])),
        still_count=len(ch.get("still", [])),
        dropped_count=len(ch.get("dropped", [])),
        article_counts={s: counts.get(s, 0) for s in ("fetched", "skipped", "rejected", "failed")},
    )


def _detail(db: Session, run: TrackerRun) -> RunDetail:
    rows = db.execute(
        select(TrackerTopK, TrackerDevelopment)
        .join(TrackerDevelopment, TrackerDevelopment.id == TrackerTopK.development_id)
        .where(TrackerTopK.run_id == run.id)
        .order_by(TrackerTopK.rank)
    ).all()
    devs = [
        RankedDevelopment(
            id=dev.id,
            rank=tk.rank,
            section=tk.section,  # type: ignore[arg-type]
            title=dev.title,
            summary=tk.summary,
            sources=[SourceOut(url=s.url, title=s.title, quote=s.quote) for s in dev.sources],
        )
        for tk, dev in rows
    ]
    dropped = [DroppedDevelopment(**d) for d in (run.changes or {}).get("dropped", [])]
    return RunDetail(**_summary(db, run).model_dump(), report_md=run.report_md, developments=devs, dropped=dropped)


# ---- the agent's memory ----------------------------------------------------


@router.get("/state", response_model=StateOut)
def get_state(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> StateOut:
    """Everything the agent needs at the start of a run."""
    seen = db.execute(
        select(
            TrackerArticle.canonical_url,
            func.max(TrackerArticle.title),
            func.max(TrackerArticle.content_hash),
            func.max(TrackerArticle.fetched_at),
        )
        .where(TrackerArticle.user_id == user.id, TrackerArticle.status == "fetched")
        .group_by(TrackerArticle.canonical_url)
    ).all()
    devs = db.scalars(
        select(TrackerDevelopment).where(TrackerDevelopment.user_id == user.id).order_by(TrackerDevelopment.id)
    )
    last_run_id, topk = _last_topk_rows(db, user)
    return StateOut(
        seen_urls=[SeenUrl(canonical_url=u, title=t or "", content_hash=h, fetched_at=f) for u, t, h, f in seen],
        developments=[_dev_out(d) for d in devs],
        last_topk=[LastTopK(development_id=r.development_id, rank=r.rank) for r in topk],
        last_run_id=last_run_id,
    )


@router.delete("/state", response_model=MessageResponse)
def reset_state(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MessageResponse:
    """Forget everything this user's tracker has stored (children first)."""
    run_ids = select(TrackerRun.id).where(TrackerRun.user_id == user.id)
    dev_ids = select(TrackerDevelopment.id).where(TrackerDevelopment.user_id == user.id)
    db.execute(delete(TrackerTopK).where(TrackerTopK.run_id.in_(run_ids)))
    db.execute(delete(TrackerSource).where(TrackerSource.development_id.in_(dev_ids)))
    db.execute(delete(TrackerArticle).where(TrackerArticle.user_id == user.id))
    db.execute(delete(TrackerDevelopment).where(TrackerDevelopment.user_id == user.id))
    db.execute(delete(TrackerRun).where(TrackerRun.user_id == user.id))
    db.commit()
    return MessageResponse(message="Tracker state reset")


# ---- runs ------------------------------------------------------------------


@router.post("/runs", response_model=RunCreated, status_code=status.HTTP_201_CREATED)
def start_run(body: RunStart, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RunCreated:
    run = TrackerRun(user_id=user.id, topic=body.topic, k=body.k, status="running", stats={}, changes={})
    db.add(run)
    db.commit()
    return RunCreated(id=run.id)


@router.post("/runs/{run_id}/finish", response_model=RunDetail)
def finish_run(
    run_id: int, body: RunFinish, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> RunDetail:
    """Persist a whole run at once: articles, developments, ranking and the diff."""
    run = _owned_run(db, user, run_id)
    if run.status != "running":
        raise HTTPException(status.HTTP_409_CONFLICT, "Run already finished")
    if len(body.developments) > run.k:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"developments: at most K={run.k} allowed")
    existing_ids = [d.existing_id for d in body.developments if d.existing_id is not None]
    if len(existing_ids) != len(set(existing_ids)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "developments: duplicate existing_id")

    now = utcnow()
    for a in body.articles:
        db.add(
            TrackerArticle(
                user_id=user.id,
                run_id=run.id,
                url=a.url,
                canonical_url=a.canonical_url,
                title=a.title,
                status=a.status,
                reason=a.reason,
                content_hash=a.content_hash,
                fetched_at=(a.fetched_at.astimezone(timezone.utc) if a.fetched_at else now),
            )
        )

    changes: dict = {"new": [], "still": [], "dropped": []}
    if body.developments:
        _, prev_rows = _last_topk_rows(db, user, before_run_id=run.id)
        prev_ids = {r.development_id for r in prev_rows}
        current: dict[int, TrackerDevelopment] = {}
        for i, d in enumerate(sorted(body.developments, key=lambda x: x.rank), start=1):
            if d.existing_id is not None:
                dev = db.get(TrackerDevelopment, d.existing_id)
                if not dev or dev.user_id != user.id:
                    raise HTTPException(status.HTTP_404_NOT_FOUND, f"Development {d.existing_id} not found")
                dev.summary = d.summary
            else:
                dev = TrackerDevelopment(user_id=user.id, title=d.title, summary=d.summary, first_run_id=run.id)
                db.add(dev)
                db.flush()
            have = {s.url for s in dev.sources}
            for s in d.sources:
                if s.url not in have:
                    have.add(s.url)
                    dev.sources.append(TrackerSource(url=s.url, title=s.title, quote=s.quote, run_id=run.id))
            section = "still" if dev.id in prev_ids else "new"
            db.add(TrackerTopK(run_id=run.id, development_id=dev.id, rank=i, section=section, summary=d.summary))
            changes[section].append(dev.id)
            current[dev.id] = dev
        for r in prev_rows:
            if r.development_id not in current:
                old = db.get(TrackerDevelopment, r.development_id)
                if old:
                    changes["dropped"].append({"id": old.id, "title": old.title, "summary": old.summary})

    run.status = body.status
    run.partial_reason = body.partial_reason
    run.report_md = body.report_md
    run.stats = body.stats
    run.changes = changes
    run.finished_at = now
    db.commit()
    return _detail(db, run)


@router.put("/runs/{run_id}/report", response_model=MessageResponse)
def attach_report(
    run_id: int, body: ReportBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> MessageResponse:
    """Attach the rendered markdown report to a finished run (it needs the ids the finish call just created)."""
    run = _owned_run(db, user, run_id)
    run.report_md = body.report_md
    db.commit()
    return MessageResponse(message="Report saved")


@router.get("/runs", response_model=list[RunSummary])
def list_runs(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[RunSummary]:
    runs = db.scalars(select(TrackerRun).where(TrackerRun.user_id == user.id).order_by(TrackerRun.id.desc()).limit(100))
    return [_summary(db, r) for r in runs]


@router.get("/runs/latest", response_model=RunDetail)
def latest_run(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RunDetail:
    run = db.scalar(
        select(TrackerRun)
        .where(TrackerRun.user_id == user.id, TrackerRun.status != "running")
        .order_by(TrackerRun.id.desc())
        .limit(1)
    )
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No finished runs yet")
    return _detail(db, run)


@router.get("/runs/{run_id}", response_model=RunDetail)
def get_run(run_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RunDetail:
    return _detail(db, _owned_run(db, user, run_id))


@router.get("/runs/{run_id}/articles", response_model=list[ArticleOut])
def run_articles(run_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ArticleOut]:
    run = _owned_run(db, user, run_id)
    rows = db.scalars(select(TrackerArticle).where(TrackerArticle.run_id == run.id).order_by(TrackerArticle.id))
    return [ArticleOut.model_validate(a, from_attributes=True) for a in rows]
