"""Application settings.

Where values come from, highest priority first:
  1. real environment variables   (production: Render's dashboard)
  2. backend/.env.local           (git-ignored: your personal keys + generated secrets)
  3. backend/.env                 (committed: throwaway grading DB + non-secret settings)

The two real secrets (JWT_SECRET, WALLET_ENCRYPTION_KEY) are never committed.
With AUTO_GENERATE_SECRETS=true (set in the committed .env) they're created
on first run and saved to .env.local, so a fresh clone runs with zero setup
and restarts keep the same keys (sessions and encrypted cards stay valid).
There are no hard-coded defaults for them anywhere in the code.
"""
import logging
import secrets
from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"
LOCAL_ENV_FILE = BACKEND_DIR / ".env.local"

log = logging.getLogger("ezwallet.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ENV_FILE, LOCAL_ENV_FILE), env_file_encoding="utf-8", extra="ignore"
    )

    # --- Secrets: env var or .env.local only; generated on first run if allowed ---
    jwt_secret: str | None = Field(default=None, min_length=32)
    wallet_encryption_key: str | None = Field(default=None, min_length=44)  # urlsafe base64 Fernet key
    auto_generate_secrets: bool = False

    # --- Database ---
    database_url: str = "sqlite:///./wallet.db"

    # --- Auth / session ---
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    vault_session_minutes: int = 5
    cookie_secure: bool = False  # set true when served over HTTPS
    pin_max_attempts: int = 5
    pin_lockout_minutes: int = 5

    # --- Google Identity Services ---
    google_client_id: str | None = None

    # --- Gemini ---
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_api_base: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_timeout_seconds: float = 60.0

    # --- Misc ---
    cors_origins: str = "http://localhost:3000"
    seed_demo_data: bool = True

    # --- Grading account (created on startup if missing; see README) ---
    grader_username: str | None = None
    grader_password: str | None = None
    grader_pin: str | None = None

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        """Hosted Postgres (Neon, Render, Heroku) hands out postgres:// or
        postgresql:// URLs; SQLAlchemy needs the driver named explicitly."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @field_validator("google_client_id", "gemini_api_key", "grader_username", "grader_password", "grader_pin", mode="before")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        return v or None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    missing = {}
    if not s.jwt_secret:
        missing["JWT_SECRET"] = secrets.token_urlsafe(48)
    if not s.wallet_encryption_key:
        missing["WALLET_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
    if not missing:
        return s
    if not s.auto_generate_secrets:
        raise RuntimeError(
            f"Missing {', '.join(missing)}. Set them as environment variables or in "
            f"{LOCAL_ENV_FILE}, or set AUTO_GENERATE_SECRETS=true to create them."
        )
    is_new = not LOCAL_ENV_FILE.exists()
    with LOCAL_ENV_FILE.open("a", encoding="utf-8") as f:
        if is_new:
            f.write("# Personal, git-ignored settings. Generated secrets are appended below.\n"
                    "# Keep this file: WALLET_ENCRYPTION_KEY decrypts your wallet cards.\n")
        for key, value in missing.items():
            f.write(f"{key}={value}\n")
    log.warning("Generated %s and saved to %s", ", ".join(missing), LOCAL_ENV_FILE)
    return Settings()
