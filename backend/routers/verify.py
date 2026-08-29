from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, status

from core.client_ip import get_client_ip
from models.schemas import (
    CredentialStatus,
    SelectiveDisclosureRequest,
    VerifyCredentialResponse,
)
from services import chain_service_client, dynamo_client

logger = logging.getLogger(__name__)
# Separate, greppable channel for the security-relevant contract lines.
# Not required for Promtail to pick them up (it tails container
# stdout/stderr via Docker service discovery regardless of logger name)
# but keeps this signal easy to isolate from general app logs.
verification_logger = logging.getLogger("verification")

router = APIRouter(prefix="/api/v1/credentials", tags=["verification"])

# Allow-list of fields that are ever eligible for selective disclosure,
# per credential_type-agnostic baseline. In a fuller implementation this
# would be keyed by credential_type and loaded from config/Dynamo rather
# than hardcoded, but the enforcement point (never trust the request's
# own field list) is what matters here.
_DISCLOSABLE_FIELD_ALLOWLIST = {
    "degree_name",
    "graduation_date",
    "honors",
    "credential_type",
    "university_id",
}


def _log_status(chain_valid: bool, on_chain_status: str) -> str:

    if not chain_valid:
        return "INVALID_PROOF"
    if on_chain_status == "revoked":
        return "REVOKED"
    if on_chain_status == "issued":
        return "VALID"
    return "INVALID_PROOF"


@router.post("/verify", response_model=VerifyCredentialResponse)
async def verify_credential(
    payload: SelectiveDisclosureRequest, request: Request
) -> VerifyCredentialResponse:
    # Look up the index entry mainly to fail fast with a clean 404 for
    # unknown IDs before making a chain-service round trip. This is a
    # convenience check, not the source of truth for validity — validity
    # always comes from chain_service_client.verify_proof below.
    index_entry = await dynamo_client.get_credential_index(payload.credential_id)
    if index_entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No credential found with id {payload.credential_id}",
        )

    # Never trust the caller's disclosed_fields list as-is — intersect
    # against the allow-list so a malicious/buggy verifier request can't
    # coax extra fields out of chain-service beyond what's disclosable.
    requested_fields = [
        f for f in payload.disclosed_fields if f in _DISCLOSABLE_FIELD_ALLOWLIST
    ]

    # This call raises ChainServiceUnavailableError on any connectivity
    # problem — deliberately uncaught here. See module docstring.
    chain_result = await chain_service_client.verify_proof(
        credential_id=payload.credential_id,
        proof_payload=payload.proof_payload,
        requested_fields=requested_fields,
    )

    on_chain_status = chain_result.get("on_chain_status", "unknown")
    chain_valid = bool(chain_result.get("valid", False))
    is_valid = chain_valid and on_chain_status == "issued"

    # Observability log contract — see module docstring. Only reached
    # once chain-service has actually answered; an outage raises before
    # this point and is handled by the global 503 handler instead.
    verification_logger.info(
        "event=verification status=%s ip=%s credentialId=%s",
        _log_status(chain_valid, on_chain_status),
        get_client_ip(request),
        payload.credential_id,
    )

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
    """
    Lightweight status check (no proof payload) — e.g. for the verify
    page to show "issued" vs "revoked" before the holder even presents a
    proof. Still queries chain-service live rather than trusting only
    the DynamoDB cache, since Dynamo could lag a moment behind a very
    recent revocation.
    """
    index_entry = await dynamo_client.get_credential_index(credential_id)
    if index_entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No credential found with id {credential_id}",
        )

    # Same rule applies: connectivity failures propagate to the global
    # 503 handler rather than being swallowed into a status value here.
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
