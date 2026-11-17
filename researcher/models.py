from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ResearchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    topic: Annotated[str, Field(min_length=1, max_length=1000)]
    k: Annotated[int, Field(ge=1, le=10)]


class ClaimOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    claim_id: Annotated[str, Field(min_length=1, max_length=64)]
    text: Annotated[str, Field(min_length=1, max_length=2000)]
    source_url: Annotated[str, Field(min_length=1, max_length=2048)]


class DevelopmentOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: Annotated[str, Field(min_length=1, max_length=64)]
    title: Annotated[str, Field(min_length=1, max_length=500)]
    summary: Annotated[str, Field(max_length=4000)]
    claims: Annotated[list[ClaimOut], Field(min_length=1, max_length=20)]


class ResearchResult(BaseModel):
    """What the orchestrator validates a /research response against (the `result` part, in rank order)."""
    model_config = ConfigDict(extra="forbid", strict=True)
    developments: list[DevelopmentOut]

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [d.id for d in self.developments]
        cids = [c.claim_id for d in self.developments for c in d.claims]
        if len(set(ids)) != len(ids) or len(set(cids)) != len(cids):
            raise ValueError("development ids and claim ids must be unique")
        return self
