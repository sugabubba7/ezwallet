from pathlib import Path

from alembic import command
from alembic.config import Config

from .config import get_settings

BACKEND_DIR = Path(__file__).resolve().parent.parent


def alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url)
    return cfg


def run_migrations() -> None:
    """Apply all pending Alembic migrations (idempotent)."""
    command.upgrade(alembic_config(), "head")
