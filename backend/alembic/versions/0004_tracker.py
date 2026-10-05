"""Competitor tracker: runs, developments, sources, articles, top-K.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-04 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "tracker_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", _TS, nullable=False),
        sa.Column("finished_at", _TS, nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("partial_reason", sa.String(300), nullable=True),
        sa.Column("topic", sa.String(300), nullable=False),
        sa.Column("k", sa.Integer(), nullable=False),
        sa.Column("report_md", sa.Text(), nullable=False),
        sa.Column("stats", sa.JSON(), nullable=False),
        sa.Column("changes", sa.JSON(), nullable=False),
    )
    op.create_index("ix_tracker_runs_user_id", "tracker_runs", ["user_id"])

    op.create_table(
        "tracker_developments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("first_run_id", sa.Integer(), sa.ForeignKey("tracker_runs.id", ondelete="SET NULL")),
        sa.Column("created_at", _TS, nullable=False),
        sa.Column("updated_at", _TS, nullable=False),
    )
    op.create_index("ix_tracker_developments_user_id", "tracker_developments", ["user_id"])

    op.create_table(
        "tracker_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "development_id",
            sa.Integer(),
            sa.ForeignKey("tracker_developments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("tracker_runs.id", ondelete="SET NULL")),
        sa.Column("created_at", _TS, nullable=False),
        sa.UniqueConstraint("development_id", "url", name="uq_tracker_source_dev_url"),
    )
    op.create_index("ix_tracker_sources_development_id", "tracker_sources", ["development_id"])

    op.create_table(
        "tracker_articles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("tracker_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("canonical_url", sa.String(2048), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reason", sa.String(300), nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=True),
        sa.Column("fetched_at", _TS, nullable=False),
    )
    op.create_index("ix_tracker_articles_user_id", "tracker_articles", ["user_id"])
    op.create_index("ix_tracker_articles_run_id", "tracker_articles", ["run_id"])
    op.create_index("ix_tracker_articles_canonical_url", "tracker_articles", ["canonical_url"])

    op.create_table(
        "tracker_topk",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("tracker_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "development_id",
            sa.Integer(),
            sa.ForeignKey("tracker_developments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("section", sa.String(8), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
    )
    op.create_index("ix_tracker_topk_run_id", "tracker_topk", ["run_id"])
    op.create_index("ix_tracker_topk_development_id", "tracker_topk", ["development_id"])


def downgrade() -> None:
    for t in ("tracker_topk", "tracker_articles", "tracker_sources", "tracker_developments", "tracker_runs"):
        op.drop_table(t)
