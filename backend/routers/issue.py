from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from core.config import get_settings
from core.security import require_admin_api_key
from models.schemas import (
    CredentialIndexItem,
    CredentialStatus,
    IssueCredentialRequest,
    IssueCredentialResponse,
)
from services import chain_service_client, dynamo_client, s3_client
from services.qr_generator import generate_qr_for_credential

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/credentials",
    tags=["issuance"],
    dependencies=[Depends(require_admin_api_key)],
)


@router.post(
    "/issue",
    response_model=IssueCredentialResponse,
    status_code=status.HTTP_201_CREATED,
)
async def issue_credential(payload: IssueCredentialRequest) -> IssueCredentialResponse:
    if not get_settings().issuer_pk:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Issuer signing key is not configured.",
        )

    credential_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    chain_result = await chain_service_client.issue_credential(
        credential_id=credential_id,
        university_id=payload.university_id,
        credential_type=payload.credential_type,
        witness=payload.witness.model_dump(),
    )

    chain_status = chain_result.get("status", "pending")
    chain_proof_ref = chain_result.get("chain_proof_ref")

    if chain_status == "failed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Credential issuance failed on-chain. No record was created.",
        )
    verify_url, qr_png = generate_qr_for_credential(credential_id)

    try:
        qr_key, qr_public_url = await s3_client.upload_qr_code(credential_id, qr_png)
    except s3_client.S3ClientError as exc:
        logger.exception("QR upload failed after successful on-chain issuance for %s", credential_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Credential was issued on-chain but QR asset generation "
                "failed. Contact support with this reference: " + credential_id
            ),
        ) from exc

    # Write the non-sensitive index entry.
    index_item = CredentialIndexItem(
        credential_id=credential_id,
        university_id=payload.university_id,
        status=CredentialStatus.ISSUED if chain_status == "issued" else CredentialStatus.PENDING,
        created_at=now,
        updated_at=now,
        qr_code_s3_key=qr_key,
        qr_code_public_url=qr_public_url,
        chain_proof_ref=chain_proof_ref,
        credential_type=payload.credential_type,
    )

    try:
        await dynamo_client.put_credential_index(index_item)
    except dynamo_client.DynamoClientError as exc:
        logger.exception("DynamoDB index write failed after successful on-chain issuance for %s", credential_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Credential was issued on-chain but the index record failed "
                "to save. Contact support with this reference: " + credential_id
            ),
        ) from exc

    return IssueCredentialResponse(
        credential_id=credential_id,
        status=index_item.status,
        qr_code_url=qr_public_url,
        verify_url=verify_url,
        chain_proof_ref=chain_proof_ref,
    )
