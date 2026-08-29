from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from core.security import require_admin_or_issuer
from models.schemas import (
    CredentialStatus,
    RevokeCredentialRequest,
)
from services import chain_service_client, dynamo_client

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/credentials",
    tags=["revocation"],
    # Admin key (API/ops path) or the dashboard's issuer header (MVP).
    dependencies=[Depends(require_admin_or_issuer)],
)


def _revoke_response(credential_id: str, status_value: CredentialStatus, revoked_at: datetime) -> dict:
    # Field names the dashboard reads (id, uppercase status —
    # frontend/lib/types.ts RevokeCredentialResult) plus the original keys
    # for anything scripted against the earlier shape.
    return {
        "id": credential_id,
        "credential_id": credential_id,
        "status": "REVOKED" if status_value == CredentialStatus.REVOKED else "ACTIVE",
        "revoked_at": revoked_at.isoformat(),
    }


@router.post("/{credential_id}/revoke")
async def revoke_credential(
    credential_id: str,
    payload: RevokeCredentialRequest | None = None,
) -> dict:
    existing = await dynamo_client.get_credential_index(credential_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No credential found with id {credential_id}",
        )

    if existing.status == CredentialStatus.REVOKED:
        # Idempotent: revoking an already-revoked credential just returns
        # the existing state rather than erroring.
        return _revoke_response(
            credential_id, existing.status, existing.revoked_at or datetime.now(timezone.utc)
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

    return _revoke_response(credential_id, updated.status, revoked_at)
