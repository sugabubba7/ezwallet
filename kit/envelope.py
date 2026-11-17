"""The wire envelope every worker request uses, plus the canonical body hash used for idempotency."""
import hashlib
import json
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, UUID4

MAX_TIME_BUDGET_MS = 10 * 60 * 1000


class Budget(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    max_steps: Annotated[int, Field(ge=0, le=1000)]
    max_fetches: Annotated[int, Field(ge=0, le=1000)]
    max_tokens: Annotated[int, Field(ge=0, le=10_000_000)]


class Envelope(BaseModel):
    """`payload` is validated separately against each endpoint's own model."""
    model_config = ConfigDict(extra="forbid")  # lax on types only so UUID strings parse
    request_id: UUID4
    run_id: UUID4
    time_budget_ms: Annotated[int, Field(ge=1, le=MAX_TIME_BUDGET_MS, strict=True)]
    budget: Budget
    payload: dict[str, Any]


def body_hash(body: Any) -> str:
    """Hash of the parsed JSON with sorted keys: key order and whitespace do not matter."""
    canon = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canon.encode()).hexdigest()
