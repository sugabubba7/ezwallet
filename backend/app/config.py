"""Application settings.

Every secret is read from the environment (or a local, git-ignored `.env`).
There are deliberately no defaults for secrets: the app refuses to start
without them rather than silently running with a known key.
"""
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Required secrets (no defaults) ---
    jwt_secret: str = Field(min_length=32)
    wallet_encryption_key: str = Field(min_length=44)  # urlsafe base64 Fernet key

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

    @field_validator("google_client_id", "gemini_api_key", mode="before")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        return v or None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
