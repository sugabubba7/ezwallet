"""Load config.yaml (policy) and .env.local (secrets). Policy never comes from the model or the web."""
import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from dotenv import load_dotenv

from .retry import RetryPolicy

ROOT = Path(__file__).resolve().parent.parent
KNOWN_TOOLS = ("search_web", "fetch_article", "finish")


@dataclass(frozen=True)
class Limits:
    max_steps: int
    max_fetches: int
    max_searches: int
    max_total_tokens: int
    max_cost_usd: float
    max_wall_seconds: int
    max_article_chars: int
    finalize_reserve_tokens: int
    max_request_tokens: int | None


@dataclass(frozen=True)
class FetchPolicy:
    allowed_schemes: tuple[str, ...]
    allowed_hosts: tuple[str, ...]
    blocked_hosts: tuple[str, ...]
    allowed_ports: tuple[int, ...]
    timeout_seconds: float
    total_timeout_seconds: float
    max_bytes: int
    max_redirects: int
    user_agent: str


@dataclass(frozen=True)
class Config:
    topic: str
    k: int
    instructions: str
    tools: tuple[str, ...]
    provider: str
    model_name: str
    temperature: float
    thinking_budget: int | None
    max_output_tokens: int
    reasoning_effort: str | None
    price_in: float  # USD per 1M input tokens
    price_out: float
    limits: Limits
    fetch: FetchPolicy
    retry: RetryPolicy
    relevance_keywords: tuple[str, ...]
    search_max_results: int
    search_time_range: str | None
    dedupe_auto_merge: float
    dedupe_min_merge: float
    state: dict = field(default_factory=dict)
    path: Path = ROOT / "config.yaml"


def load_env() -> None:
    load_dotenv(ROOT / "tracker" / ".env.local")
    load_dotenv(ROOT / "tracker" / ".env")


def load_config(path: str | Path | None = None) -> Config:
    load_env()
    p = Path(path or os.environ.get("TRACKER_CONFIG") or ROOT / "config.yaml")
    raw = yaml.safe_load(p.read_text())
    k = int(raw["k"])
    if not 3 <= k <= 10:
        raise ValueError("config.yaml: k must satisfy 3 <= k <= 10")
    tools = tuple(raw["tools"])
    unknown = set(tools) - set(KNOWN_TOOLS)
    if unknown or "finish" not in tools:
        raise ValueError(f"config.yaml: tools must include finish and only {KNOWN_TOOLS}; got {tools}")
    lim, fet, rty, mod = raw["limits"], raw["fetch"], raw["retry"], raw["model"]
    return Config(
        topic=raw["topic"].strip(),
        k=k,
        instructions=raw["instructions"].strip(),
        tools=tools,
        provider=mod.get("provider", "gemini"),
        model_name=mod["name"],
        temperature=float(mod.get("temperature", 0.2)),
        thinking_budget=mod.get("thinking_budget"),
        max_output_tokens=int(mod.get("max_output_tokens", 2500)),
        reasoning_effort=mod.get("reasoning_effort"),
        price_in=float(mod.get("price_per_million_input_usd", 0)),
        price_out=float(mod.get("price_per_million_output_usd", 0)),
        limits=Limits(**{f: lim.get(f) for f in Limits.__dataclass_fields__}),
        fetch=FetchPolicy(
            allowed_schemes=tuple(s.lower() for s in fet["allowed_schemes"]),
            allowed_hosts=tuple(h.lower() for h in fet["allowed_hosts"]),
            blocked_hosts=tuple(h.lower() for h in fet.get("blocked_hosts", [])),
            allowed_ports=tuple(int(x) for x in fet["allowed_ports"]),
            timeout_seconds=float(fet["timeout_seconds"]),
            total_timeout_seconds=float(fet["total_timeout_seconds"]),
            max_bytes=int(fet["max_bytes"]),
            max_redirects=int(fet["max_redirects"]),
            user_agent=fet["user_agent"],
        ),
        retry=RetryPolicy(**rty),
        relevance_keywords=tuple(k.lower() for k in raw.get("relevance_keywords", [])),
        search_max_results=int(raw["search"]["max_results"]),
        search_time_range=raw["search"].get("time_range"),
        dedupe_auto_merge=float(raw["dedupe"]["auto_merge_similarity"]),
        dedupe_min_merge=float(raw["dedupe"]["min_similarity_to_trust_model"]),
        state=raw.get("state", {}),
        path=p,
    )


def need_env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        from .errors import AuthError

        raise AuthError(f"{name} is not set. Copy tracker/.env.example to tracker/.env.local and fill it in.")
    return v
