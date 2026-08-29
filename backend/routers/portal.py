"""
Spec-conformant API surface consumed by the Next.js frontend.

docs/api-spec.md defines `GET /verify/{id}`, `POST /credentials`,
`GET /credentials`, etc. — this router implements those. The older
`/credentials/issue` + `/credentials/verify` routes in issue.py/verify.py
predate the spec and are kept for compatibility.

Error responses here use the spec's envelope — {"error": {"code", "message"}}
— which is also what frontend/lib/api.ts parses for user-facing messages.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.client_ip import get_client_ip
from core.config import get_settings
from core.security import require_issuer_address
from models.schemas import CredentialIndexItem, CredentialStatus
from services import chain_service_client, dynamo_client, s3_client
from services.qr_generator import generate_qr_for_credential

logger = logging.getLogger(__name__)
verification_logger = logging.getLogger("verification")

router = APIRouter(prefix="/api/v1", tags=["portal"])


def _api_error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message}})


def _not_found(credential_id: str) -> JSONResponse:
    return _api_error(404, "NOT_FOUND", f"No credential found with id {credential_id}")


# ---------------------------------------------------------------------------
# Public verification — GET /verify/{credentialId}?disclose=gpa
# ---------------------------------------------------------------------------

@router.get("/verify/{credential_id}")
async def verify_credential_public(credential_id: str, request: Request, disclose: str = ""):
    index_entry = await dynamo_client.get_credential_index(credential_id)
    if index_entry is None:
        return _not_found(credential_id)

    disclose_fields = ["gpa"] if "gpa" in {p.strip() for p in disclose.split(",")} else []
    chain_result = await chain_service_client.verify_proof(
        credential_id=credential_id,
        proof_payload="",
        requested_fields=disclose_fields,
    )
    raw = chain_result["chain"]
    chain_status = raw.get("status", "INVALID_PROOF")

    verification_logger.info(
        "event=verification status=%s ip=%s credentialId=%s",
        chain_status,
        get_client_ip(request),
        credential_id,
    )

    # `disclosed` is null whenever the proof did not succeed — the circuit
    # aborts before producing a DisclosedClaim, for REVOKED *and* INVALID_PROOF
    # alike. Treating that as an empty dict and then filling `.get(key, 0)`
    # defaults fabricated data: a revoked or forged credential rendered
    # "Degree Code 0 / Graduation Year 0" under the heading "Disclosed Fields",
    # beside a genuine institution and degree pulled from the off-chain index.
    #
    # Absent is not zero. Emit None so the UI can say "not disclosed", matching
    # the convention this codebase already states in chain-service's mock.ts
    # ("null, never 0 — driven by consent, not by the value") and that line 87
    # below already follows for gpa.
    raw_disclosed = raw.get("disclosed") or {}
    evidence = raw.get("evidence") or {}
    proof = raw.get("proof") or {}
    gpa_times_100 = raw_disclosed.get("gpaTimes100")
    checked_at = evidence.get("checkedAt", datetime.now(timezone.utc).isoformat())
    tx_id = evidence.get("issuanceTxId", "")

    disclosed = {
        # Human-readable names come from the off-chain index; the chain
        # only ever sees opaque digests (see chain_service_client._hex32).
        "institution": index_entry.university_id,
        "institutionId": raw_disclosed.get("institutionId") or None,
        "degree": index_entry.credential_type or "",
        "degreeCode": raw_disclosed.get("degreeCode"),
        "graduationYear": raw_disclosed.get("graduationYear"),
        "gpa": (gpa_times_100 / 100) if gpa_times_100 is not None else None,
    }

    # Invariant: every chain-disclosable field appears in exactly one of
    # `disclosed` (with a real value) or `withheld`.
    #
    # chain-service derives `withheld` from CONSENT alone, independent of
    # status, while gating `disclosed` on the proof succeeding. On a revoked
    # credential where the holder *had* consented to GPA, that left gpa in
    # neither list: null in `disclosed`, absent from `withheld` — silently
    # unaccounted for. Since "what was withheld" is the core privacy claim we
    # show the verifier, a field vanishing from both sides undermines it.
    #
    # Note `is None` rather than falsiness: a real 0.00 GPA is disclosed data.
    chain_disclosable = ("institutionId", "degreeCode", "graduationYear", "gpa")
    undisclosed = {key for key in chain_disclosable if disclosed[key] is None}
    withheld = sorted(set(raw.get("withheld") or []) | undisclosed)

    return {
        "status": chain_status,
        "disclosed": disclosed,
        "proof": {
            "verified": proof.get("verified", chain_status == "VALID"),
            "issuerAuthorized": chain_status != "INVALID_PROOF",
            "revoked": chain_status == "REVOKED",
            "networkId": evidence.get("networkId", ""),
            "contractAddress": evidence.get("contractAddress", ""),
            # Spec names + the aliases frontend/lib/types.ts reads.
            "issuanceTxId": tx_id,
            "txId": tx_id,
            "stateBlockHeight": evidence.get("stateBlockHeight"),
            "checkedAt": checked_at,
            "provedAt": checked_at,
        },
        "withheld": withheld,
    }


# ---------------------------------------------------------------------------
# University endpoints (issuer identity via X-Issuer-Address for the MVP)
# ---------------------------------------------------------------------------

class PortalIssueRequest(BaseModel):
    studentName: str
    studentId: str
    degree: str
    institution: str
    major: str = ""
    graduationDate: str = ""
    honors: str = ""
    gpa: str = ""


@router.post("/credentials", status_code=201)
async def issue_credential_portal(
    payload: PortalIssueRequest,
    issuer: str = Depends(require_issuer_address),
):
    if not get_settings().issuer_pk:
        return _api_error(503, "CHAIN_UNAVAILABLE", "Issuer signing key is not configured.")

    credential_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        gpa = float(payload.gpa) if payload.gpa.strip() else None
    except ValueError:
        return _api_error(400, "VALIDATION_ERROR", "GPA must be a number.")

    witness = {
        "student_name": payload.studentName,
        "student_id": payload.studentId,
        "degree_name": payload.degree,
        "graduation_date": payload.graduationDate,
        "gpa": gpa,
        "honors": payload.honors or None,
        # The salt never leaves the chain-service private state — generated
        # here, forwarded once, never stored or returned (docs/data-model.md).
        "salt": secrets.token_hex(32),
    }
    chain_result = await chain_service_client.issue_credential(
        credential_id=credential_id,
        university_id=payload.institution,
        credential_type=payload.degree,
        witness=witness,
    )

    verify_url, qr_png = generate_qr_for_credential(credential_id)
    try:
        qr_key, qr_public_url = await s3_client.upload_qr_code(credential_id, qr_png)
    except s3_client.S3ClientError:
        logger.exception("QR upload failed after issuance for %s", credential_id)
        return _api_error(500, "UNKNOWN_ERROR", "Credential was issued on-chain but QR generation failed. Reference: " + credential_id)

    year_prefix = payload.graduationDate[:4]
    index_item = CredentialIndexItem(
        credential_id=credential_id,
        university_id=payload.institution,
        status=CredentialStatus.ISSUED,
        created_at=now,
        updated_at=now,
        qr_code_s3_key=qr_key,
        qr_code_public_url=qr_public_url,
        chain_proof_ref=chain_result.get("chain_proof_ref"),
        credential_type=payload.degree,
        graduation_year=int(year_prefix) if year_prefix.isdigit() else None,
    )
    try:
        await dynamo_client.put_credential_index(index_item)
    except dynamo_client.DynamoClientError:
        logger.exception("Index write failed after issuance for %s", credential_id)
        return _api_error(500, "UNKNOWN_ERROR", "Credential was issued on-chain but the index write failed. Reference: " + credential_id)

    return {
        "id": credential_id,
        "commitmentHash": (chain_result.get("chain") or {}).get("commitment", ""),
        "metadataCid": "",  # no IPFS in the local build
        "txId": chain_result.get("chain_proof_ref") or "",
        "verifyUrl": verify_url,
        "qrCodeUrl": qr_public_url,
    }


_UI_STATUS = {
    CredentialStatus.ISSUED: "ACTIVE",
    CredentialStatus.PENDING: "ACTIVE",
    CredentialStatus.REVOKED: "REVOKED",
    CredentialStatus.FAILED: "REVOKED",
}


@router.get("/credentials")
async def list_credentials(
    status: str = "",
    search: str = "",
    issuer: str = Depends(require_issuer_address),
):
    items = await dynamo_client.scan_credentials()
    needle = search.strip().lower()
    out = []
    for item in sorted(items, key=lambda i: i.created_at, reverse=True):
        ui_status = _UI_STATUS.get(item.status, "ACTIVE")
        if status and status != "ALL" and ui_status != status:
            continue
        haystack = f"{item.credential_id} {item.credential_type or ''} {item.university_id}".lower()
        if needle and needle not in haystack:
            continue
        out.append({
            "id": item.credential_id,
            # This is the issuance TRANSACTION id, not a commitment: the index
            # stores chain_proof_ref (see POST /credentials, which returns the
            # real commitment under `commitmentHash` and this value under
            # `txId`). The two endpoints previously used the same field name
            # for two different things, and the dashboard rendered this one
            # under a "Credential ID" heading — so the value a user copied was
            # neither a credential id nor a commitment.
            "txId": item.chain_proof_ref or "",
            # Student identity is deliberately absent from the index
            # (docs/data-model.md) — the dashboard renders these blank.
            "studentName": "",
            "studentId": "",
            "degree": item.credential_type or "",
            "institution": item.university_id,
            "graduationYear": item.graduation_year or 0,
            "issuedAt": item.created_at.isoformat(),
            "status": ui_status,
        })
    return {"items": out, "total": len(out)}


@router.get("/credentials/{credential_id}/certificate")
async def download_certificate(credential_id: str, issuer: str = Depends(require_issuer_address)):
    return _api_error(501, "UNKNOWN_ERROR", "Certificate export is not available in the local demo build.")


# ---------------------------------------------------------------------------
# Institutions onboarding — demo-grade stub, keyed by issuer address.
# Not in docs/api-spec.md; exists because the dashboard settings page calls it.
#
# Persisted to a small JSON file rather than kept purely in memory: an
# unauthorized profile hard-locks the dashboard's issue form, so a plain
# backend restart used to silently send the operator back through the setup
# wizard mid-QA (or mid-demo) with no indication of why the form had re-locked.
# The file lives under the bind-mounted backend directory, so it survives both
# `uvicorn --reload` and `docker compose restart backend`.
#
# Still demo-grade: PUT approves instantly with no on-chain authorizeIssuer
# call, and there is no locking, so this is not safe for concurrent writers.
# ---------------------------------------------------------------------------

_PROFILE_STORE_PATH = Path(
    os.environ.get("INSTITUTION_STORE_PATH", ".institution-profiles.json")
)

_DEFAULT_PROFILE = {
    "name": "",
    "website": "",
    "contactEmail": "",
    "country": "",
    "status": "NOT_REGISTERED",
}


def _load_profiles() -> dict[str, dict]:
    try:
        with _PROFILE_STORE_PATH.open(encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        # A corrupt or unreadable store must not take the API down — an issuer
        # re-running the setup wizard is a far better failure than a 500.
        logger.warning("Institution profile store unreadable; starting empty", exc_info=True)
        return {}


def _save_profiles(profiles: dict[str, dict]) -> None:
    try:
        _PROFILE_STORE_PATH.write_text(json.dumps(profiles, indent=2), encoding="utf-8")
    except OSError:
        # Persistence is a convenience here, not a correctness requirement:
        # the in-request response is already correct, so degrade to
        # this-process-only rather than failing the caller's request.
        logger.warning("Could not persist institution profile store", exc_info=True)


_institution_profiles: dict[str, dict] = _load_profiles()


class InstitutionProfileInput(BaseModel):
    name: str
    website: str = ""
    contactEmail: str = ""
    country: str = ""


@router.get("/institutions/me")
async def get_institution_profile(issuer: str = Depends(require_issuer_address)):
    return _institution_profiles.get(issuer, dict(_DEFAULT_PROFILE))


@router.put("/institutions/me")
async def save_institution_profile(
    payload: InstitutionProfileInput,
    issuer: str = Depends(require_issuer_address),
):
    # Instant approval is a demo behavior; a real flow would go through
    # PENDING_REVIEW and an on-chain authorizeIssuer call.
    profile = {
        "name": payload.name,
        "website": payload.website,
        "contactEmail": payload.contactEmail,
        "country": payload.country,
        "status": "AUTHORIZED",
        "submittedAt": datetime.now(timezone.utc).isoformat(),
    }
    _institution_profiles[issuer] = profile
    _save_profiles(_institution_profiles)
    return profile
