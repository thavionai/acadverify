from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class CredentialStatus(str, Enum):
    ISSUED = "issued"
    REVOKED = "revoked"
    PENDING = "pending"
    FAILED = "failed"


class CredentialIndexItem(BaseModel):
    credential_id: str
    university_id: str
    status: CredentialStatus
    created_at: datetime
    updated_at: datetime
    revoked_at: datetime | None = None
    qr_code_s3_key: str | None = None
    qr_code_public_url: str | None = None
    # Pointer into the chain-service's own state, NOT the proof itself.
    # Used so we can re-query on-chain state without re-deriving it.
    chain_proof_ref: str | None = None
    # Non-sensitive search aid, e.g. a program/degree category. Deliberately
    # does NOT include grades, GPA, or student identity.
    credential_type: str | None = None




class WitnessData(BaseModel):

    student_name: str
    student_id: str
    degree_name: str
    graduation_date: str
    gpa: float | None = None
    honors: str | None = None
    salt: str = Field(..., description="Random salt for commitment, generated client- or server-side")

    model_config = {
        "str_strip_whitespace": True,
    }


class IssueCredentialRequest(BaseModel):
    university_id: str
    credential_type: str
    witness: WitnessData


class IssueCredentialResponse(BaseModel):
    credential_id: str
    status: CredentialStatus
    qr_code_url: str
    verify_url: str
    chain_proof_ref: str | None = None




class RevokeCredentialRequest(BaseModel):
    reason: str | None = None


class RevokeCredentialResponse(BaseModel):
    credential_id: str
    status: CredentialStatus
    revoked_at: datetime




class SelectiveDisclosureRequest(BaseModel):
    """
    Fields the *holder* has chosen to reveal for this particular
    verification
    """
    credential_id: str
    disclosed_fields: list[str] = Field(default_factory=list)

    proof_payload: str


class VerifyCredentialResponse(BaseModel):
    credential_id: str
    valid: bool
    status: CredentialStatus
    disclosed: dict[str, str] = Field(default_factory=dict)
    checked_at: datetime
    degraded: bool = False
    message: str | None = None
