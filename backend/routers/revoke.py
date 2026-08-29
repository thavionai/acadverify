from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from core.security import require_admin_api_key
from models.schemas import (
    CredentialStatus,
    RevokeCredentialRequest,
    RevokeCredentialResponse,
)
from services import chain_service_client, dynamo_client

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/credentials",
    tags=["revocation"],
    dependencies=[Depends(require_admin_api_key)],
)


@router.post(
    "/{credential_id}/revoke",
    response_model=RevokeCredentialResponse,
)
async def revoke_credential(
    credential_id: str,
    payload: RevokeCredentialRequest | None = None,
) -> RevokeCredentialResponse:
    existing = await dynamo_client.get_credential_index(credential_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No credential found with id {credential_id}",
        )

    if existing.status == CredentialStatus.REVOKED:
        # Idempotent: revoking an already-revoked credential just returns
        # the existing state rather than erroring.
        return RevokeCredentialResponse(
            credential_id=credential_id,
            status=existing.status,
            revoked_at=existing.revoked_at or datetime.now(timezone.utc),
        )

    reason = payload.reason if payload else None

    # On-chain revocation first — see module docstring. If chain-service
    # is unreachable, ChainServiceUnavailableError propagates to the
    # global Phase 4 handler as a 503, and Dynamo is never touched.
    chain_result = await chain_service_client.revoke_credential(credential_id, reason=reason)

    revoked_at_str = chain_result.get("revoked_at")
    revoked_at = (
        datetime.fromisoformat(revoked_at_str) if revoked_at_str else datetime.now(timezone.utc)
    )

    try:
        updated = await dynamo_client.update_credential_status(
            credential_id,
            CredentialStatus.REVOKED,
            revoked_at=revoked_at,
        )
    except dynamo_client.DynamoClientError as exc:
        logger.exception(
            "DynamoDB status update failed after successful on-chain revocation for %s",
            credential_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Credential was revoked on-chain but the index update failed. "
                "The credential IS revoked; contact support to sync the index "
                "for reference: " + credential_id
            ),
        ) from exc

    return RevokeCredentialResponse(
        credential_id=credential_id,
        status=updated.status,
        revoked_at=revoked_at,
    )
