"""Usernames: accounts can have a username, an email, or both.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-29 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("username", sa.String(length=32), nullable=True))
        batch_op.alter_column("email", existing_type=sa.String(length=320), nullable=True)
        batch_op.create_index(batch_op.f("ix_users_username"), ["username"], unique=True)


def downgrade() -> None:
    # Username-only accounts cannot survive a schema that requires an email.
    op.execute("DELETE FROM users WHERE email IS NULL")
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_username"))
        batch_op.alter_column("email", existing_type=sa.String(length=320), nullable=False)
        batch_op.drop_column("username")
