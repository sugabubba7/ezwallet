"""Orange/black card skins, message counts and last-activity time.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-28 22:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Old multi-hue skins -> new orange/black palette (and back for downgrade).
COLOR_MAP = {
    "sapphire": "ember",
    "peach": "amber",
    "ivory": "cream",
    "mint": "copper",
    "lilac": "rust",
    "graphite": "noir",
}


def _remap(mapping: dict[str, str]) -> None:
    cards = sa.table("wallet_cards", sa.column("color", sa.String))
    for old, new in mapping.items():
        op.execute(cards.update().where(cards.c.color == old).values(color=new))


def upgrade() -> None:
    with op.batch_alter_table("chat_summaries", schema=None) as batch_op:
        batch_op.add_column(sa.Column("message_count", sa.Integer(), nullable=False, server_default="2"))
        batch_op.add_column(sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE chat_summaries SET updated_at = created_at")
    with op.batch_alter_table("chat_summaries", schema=None) as batch_op:
        batch_op.alter_column("updated_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    _remap(COLOR_MAP)


def downgrade() -> None:
    _remap({new: old for old, new in COLOR_MAP.items()})
    with op.batch_alter_table("chat_summaries", schema=None) as batch_op:
        batch_op.drop_column("updated_at")
        batch_op.drop_column("message_count")
