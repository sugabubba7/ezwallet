from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ClaimIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    claim_id: Annotated[str, Field(min_length=1, max_length=64)]
    text: Annotated[str, Field(min_length=1, max_length=2000)]
    source_url: Annotated[str, Field(min_length=1, max_length=2048)]


class VerifyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    claims: Annotated[list[ClaimIn], Field(min_length=1, max_length=60)]

    @field_validator("claims")
    @classmethod
    def unique_ids(cls, v: list[ClaimIn]) -> list[ClaimIn]:
        ids = [c.claim_id for c in v]
        if len(set(ids)) != len(ids):
            raise ValueError("claim_id values must be unique")
        return v


class VerdictOut(BaseModel):
    """One verdict on the wire. The orchestrator validates every response against this."""
    model_config = ConfigDict(extra="forbid", strict=True)
    claim_id: str
    verdict: Literal["supported", "unsupported", "unreachable"]
    evidence: Annotated[str, Field(max_length=300)] | None

    @model_validator(mode="after")
    def evidence_rule(self):
        """evidence is a string on supported verdicts and null otherwise."""
        if self.verdict == "supported" and not self.evidence:
            raise ValueError("supported verdict without evidence")
        if self.verdict != "supported" and self.evidence is not None:
            raise ValueError("evidence must be null unless the verdict is supported")
        return self
