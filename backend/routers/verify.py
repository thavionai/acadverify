from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from models.schemas import (
    CredentialStatus,
    SelectiveDisclosureRequest,
    VerifyCredentialResponse,
)
from services import chain_service_client, dynamo_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/credentials", tags=["verification"])


_DISCLOSABLE_FIELD_ALLOWLIST = {
    "degree_name",
    "graduation_date",
    "honors",
    "credential_type",
    "university_id",
}


@router.post("/verify", response_model=VerifyCredentialResponse)
async def verify_credential(payload: SelectiveDisclosureRequest) -> VerifyCredentialResponse:

    index_entry = await dynamo_client.get_credential_index(payload.credential_id)
    if index_entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No credential found with id {payload.credential_id}",
        )

    requested_fields = [
        f for f in payload.disclosed_fields if f in _DISCLOSABLE_FIELD_ALLOWLIST
    ]

    chain_result = await chain_service_client.verify_proof(
        credential_id=payload.credential_id,
        proof_payload=payload.proof_payload,
        requested_fields=requested_fields,
    )

    on_chain_status = chain_result.get("on_chain_status", "unknown")
    is_valid = bool(chain_result.get("valid", False)) and on_chain_status == "issued"

    status_map = {
        "issued": CredentialStatus.ISSUED,
        "revoked": CredentialStatus.REVOKED,
    }
    resolved_status = status_map.get(on_chain_status, index_entry.status)

    return VerifyCredentialResponse(
        credential_id=payload.credential_id,
        valid=is_valid,
        status=resolved_status,
        disclosed=chain_result.get("disclosed", {}),
        checked_at=datetime.now(timezone.utc),
        degraded=False,
    )


@router.get("/{credential_id}/status", response_model=VerifyCredentialResponse)
async def get_credential_status(credential_id: str) -> VerifyCredentialResponse:
    index_entry = await dynamo_client.get_credential_index(credential_id)
    if index_entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No credential found with id {credential_id}",
        )

    chain_result = await chain_service_client.get_proof_state(credential_id)
    on_chain_status = chain_result.get("on_chain_status", "unknown")

    status_map = {
        "issued": CredentialStatus.ISSUED,
        "revoked": CredentialStatus.REVOKED,
    }
    resolved_status = status_map.get(on_chain_status, index_entry.status)

    return VerifyCredentialResponse(
        credential_id=credential_id,
        valid=(resolved_status == CredentialStatus.ISSUED),
        status=resolved_status,
        disclosed={},
        checked_at=datetime.now(timezone.utc),
        degraded=False,
    )
