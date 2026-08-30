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

import hashlib
import json
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core import share_grants
from core.client_ip import get_client_ip
from core.config import get_settings
from core.security import require_issuer_address
from models.schemas import CredentialIndexItem, CredentialStatus
from services import chain_service_client, dynamo_client, s3_client
from services.certificate import render_certificate_pdf
from services.qr_generator import build_verify_url, generate_qr_for_credential

logger = logging.getLogger(__name__)
verification_logger = logging.getLogger("verification")

router = APIRouter(prefix="/api/v1", tags=["portal"])


def _api_error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message}})


def _not_found(credential_id: str) -> JSONResponse:
    return _api_error(404, "NOT_FOUND", f"No credential found with id {credential_id}")


# ---------------------------------------------------------------------------
# Public verification — GET /verify/{credentialId}?grant={grantId}
# ---------------------------------------------------------------------------

@router.get("/verify/{credential_id}")
async def verify_credential_public(
    credential_id: str,
    request: Request,
    disclose: str = "",
    grant: str = "",
):
    index_entry = await dynamo_client.get_credential_index(credential_id)
    if index_entry is None:
        return _not_found(credential_id)

    # Disclosure is decided by the HOLDER, not by whoever opens the link.
    #
    # `disclose=gpa` used to be enough: a public query parameter, driven by a
    # toggle on the verification page, so any verifier could reveal the GPA of
    # any credential whose link they held. The product's central claim — that
    # the graduate chooses what a verifier sees — was not true of the software.
    #
    # The parameter is still accepted so certificates and QR codes printed
    # before this change keep resolving, but it no longer discloses anything.
    _ = disclose

    disclose_fields: list[str] = []
    if grant:
        active = share_grants.get_active_grant(grant)
        # Unknown, revoked, and belongs-to-another-credential are reported
        # identically on purpose: a verifier must not be able to probe whether
        # a given grant ever existed, or which part of the check failed.
        if active is None or active.get("credentialId") != credential_id:
            return _api_error(
                404,
                "GRANT_NOT_FOUND",
                "This share link is invalid or was revoked by the credential holder.",
            )
        if active.get("revealGpa"):
            disclose_fields = ["gpa"]
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

    # A proof that did not succeed disclosed NOTHING, and that has to include
    # the two human-readable fields as well.
    #
    # These come from the off-chain index rather than the circuit, so the
    # earlier fix (which gated only the four chain-derived fields) left them
    # populated on a failed proof: a REVOKED or INVALID_PROOF credential
    # rendered "Institution: X / Degree: Y" under the heading *Disclosed
    # Fields*, next to "Invalid proof". The verifier reads that as "the proof
    # vouched for the institution and degree" when the proof vouched for
    # nothing at all — the same category error as the fabricated zeros, one
    # field over.
    proof_succeeded = chain_status == "VALID"

    disclosed = {
        # Human-readable names come from the off-chain index; the chain
        # only ever sees opaque digests (see chain_service_client._hex32).
        "institution": index_entry.university_id if proof_succeeded else None,
        "institutionId": raw_disclosed.get("institutionId") or None,
        "degree": (index_entry.credential_type or "") if proof_succeeded else None,
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
    chain_disclosable = (
        "institution",
        "institutionId",
        "degree",
        "degreeCode",
        "graduationYear",
        "gpa",
    )
    undisclosed = {key for key in chain_disclosable if disclosed[key] is None}
    withheld = sorted(set(raw.get("withheld") or []) | undisclosed)

    return {
        "status": chain_status,
        "disclosed": disclosed,
        "proof": {
            "verified": proof.get("verified", chain_status == "VALID"),
            # Unknown, not False, on a failed proof.
            #
            # proveCredential asserts four things — the credential exists, the
            # commitment matches, it is not revoked, and the issuer is
            # authorised — and a failed proof does not say WHICH assert
            # tripped. Deriving this from the status therefore printed "Issuer
            # Authorized: No" for a credential whose data had simply been
            # tampered with, which reads as "this university is not recognised
            # by the platform": a specific and damaging accusation the system
            # has no evidence for. Only a successful proof establishes it.
            "issuerAuthorized": True if chain_status == "VALID" else None,
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
    # No ISSUER_PK check any more: the backend neither holds nor forwards a
    # signing key. chain-service derives this institution's key from `issuer`,
    # which also removes a failure mode nobody would have caught — the env var
    # happened to equal the mock adapter's hardcoded issuer, so issuance worked
    # in mock and would have failed the circuit's assert in live.
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
    async def _issue():
        return await chain_service_client.issue_credential(
            credential_id=credential_id,
            university_id=payload.institution,
            credential_type=payload.degree,
            witness=witness,
            issuer_identity=issuer,
        )

    try:
        chain_result = await _issue()
    except Exception as exc:
        # The chain can lose an authorisation the registry still records —
        # a chain-service restart empties the mock adapter's in-memory
        # `issuers` set, and the stored profile keeps saying AUTHORIZED with a
        # valid issuerPk, so nothing looked stale. Issuance then failed with
        # "This issuer key is not authorized on-chain" for an institution that
        # had genuinely registered.
        #
        # The profile store is the record of WHO REGISTERED; on-chain
        # authorisation is a projection of it. If the projection is missing for
        # a registered institution, re-assert it and retry once. An institution
        # with no profile gets no second chance.
        profile = _institution_profiles.get(issuer)
        registered = bool(profile and profile.get("status") == "AUTHORIZED")
        if not registered or "ISSUER_NOT_AUTHORIZED" not in str(exc):
            raise

        logger.warning(
            "issuer=%s is registered but not authorized on-chain; re-authorizing", issuer
        )
        chain_result = await chain_service_client.authorize_issuer(issuer)
        profile["issuerPk"] = chain_result.get("issuerPk", profile.get("issuerPk", ""))
        profile["authorizationTxId"] = chain_result.get("txId", "")
        _save_profiles(_institution_profiles)
        chain_result = await _issue()

    verify_url, qr_png = generate_qr_for_credential(credential_id)
    try:
        qr_key, qr_public_url = await s3_client.upload_qr_code(credential_id, qr_png)
    except s3_client.S3ClientError:
        logger.exception("QR upload failed after issuance for %s", credential_id)
        return _api_error(500, "UNKNOWN_ERROR", "Credential was issued on-chain but QR generation failed. Reference: " + credential_id)

    year_prefix = payload.graduationDate[:4]
    # The graduate's own access link. Minted once, here, and never
    # reconstructable afterwards: only its digest is stored, so a leaked index
    # cannot be turned back into working access links.
    holder_token = secrets.token_urlsafe(32)

    index_item = CredentialIndexItem(
        credential_id=credential_id,
        issuer_address=issuer,
        holder_token_hash=hashlib.sha256(holder_token.encode()).hexdigest(),
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
        # Returned exactly once. The university hands this to the graduate;
        # nothing on the server can produce it again.
        "holdUrl": f"{get_settings().verify_base_url.rstrip('/')}/hold/{holder_token}",
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
        # Scope to the caller. This endpoint scanned the whole table and
        # returned every credential to any caller — a wallet that had never
        # registered saw all of them — while the page above it reads
        # "credentials your institution has issued".
        #
        # Rows written before issuer_address existed have no owner. They are
        # hidden rather than shown to everyone: unknown ownership is not a
        # reason to disclose another institution's credentials.
        if item.issuer_address != issuer:
            continue
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
    index_entry = await dynamo_client.get_credential_index(credential_id)
    # Scoped to the issuing institution, and a credential belonging to another
    # issuer reads as simply absent — the same response as one that never
    # existed, so this cannot be used to enumerate other universities' ids.
    if index_entry is None or index_entry.issuer_address != issuer:
        return _not_found(credential_id)

    pdf = render_certificate_pdf(
        credential_id=credential_id,
        degree=index_entry.credential_type or "",
        institution=index_entry.university_id or "",
        graduation_year=index_entry.graduation_year,
        verify_url=build_verify_url(credential_id),
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{credential_id}-certificate.pdf"'},
    )


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
    profile = _institution_profiles.get(issuer)
    if profile is None:
        return dict(_DEFAULT_PROFILE)

    # A profile saved before issuer authorisation reached the chain claims
    # AUTHORIZED on the strength of a database write alone. The ledger has
    # never heard of it, so issuing will fail the circuit's
    # `assert(issuers.member(pk))` with a confusing "not authorized on-chain".
    #
    # Report those as NOT_REGISTERED so the dashboard walks the operator back
    # through setup, which now performs the real authorizeIssuer call. Reading
    # a profile must not itself submit a transaction, so this heals on the next
    # write rather than here.
    if profile.get("status") == "AUTHORIZED" and not profile.get("issuerPk"):
        logger.info(
            "issuer=%s has a pre-authorization profile; reporting NOT_REGISTERED", issuer
        )
        return {**profile, "status": "NOT_REGISTERED"}

    return profile


@router.put("/institutions/me")
async def save_institution_profile(
    payload: InstitutionProfileInput,
    issuer: str = Depends(require_issuer_address),
):
    # Registering an institution now AUTHORISES IT ON-CHAIN.
    #
    # This used to write `status: "AUTHORIZED"` to a JSON file and stop there.
    # authorizeIssuer was a real circuit with a real HTTP route that nothing
    # ever called, so the dashboard said a university was authorised while the
    # ledger had never heard of it. Approval is still instant (no human review
    # step), but it is now backed by a transaction.
    #
    # The status only becomes AUTHORIZED if the chain call succeeds — a
    # database row claiming authorisation the chain would reject is exactly
    # the gap this closes.
    try:
        chain_result = await chain_service_client.authorize_issuer(issuer)
    except Exception:
        logger.exception("authorizeIssuer failed for issuer=%s", issuer)
        return _api_error(
            503,
            "CHAIN_UNAVAILABLE",
            "Could not authorize this institution on-chain. Nothing was saved; please retry.",
        )

    profile = {
        "name": payload.name,
        "website": payload.website,
        "contactEmail": payload.contactEmail,
        "country": payload.country,
        "status": "AUTHORIZED",
        "submittedAt": datetime.now(timezone.utc).isoformat(),
        # Evidence a judge (or an auditor) can check against the ledger.
        "issuerPk": chain_result.get("issuerPk", ""),
        "authorizationTxId": chain_result.get("txId", ""),
    }
    _institution_profiles[issuer] = profile
    _save_profiles(_institution_profiles)
    return profile
