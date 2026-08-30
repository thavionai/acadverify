"""
The graduate's own surface.

Until this existed the product had two parties, not three: universities issued,
verifiers verified, and the student — whose privacy is the entire pitch — was a
courier who carried a link between them and touched no software at all. Worse,
the verifier chose what to reveal.

Access is by possession of a secret link, like a password-reset URL: no account,
no password, nothing for a graduate to lose or for us to store. The token
reaches this router in the `X-Holder-Token` HEADER rather than the path,
because uvicorn writes request paths to the access log and an access token in a
log file is a credential leak waiting to happen.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core import share_grants
from core.config import get_settings
from models.schemas import CredentialIndexItem
from services import chain_service_client, dynamo_client, gemini_client, resume_match

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/hold", tags=["holder"])

# Resumes are pasted by hand. Anything past this is not a resume, and the cap
# keeps a hostile paste from becoming an expensive model call.
_MAX_RESUME_CHARS = 20_000


def _api_error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message}})


# One message for every way a lookup can fail — wrong token, malformed token,
# a credential issued before holder links existed. Distinguishing them would
# tell an attacker which guesses were "close".
_NO_CREDENTIAL = ("NOT_FOUND", "No credential is linked to this access link.")


async def _resolve_bundle(token: str | None) -> list[CredentialIndexItem] | JSONResponse:
    """
    Everything this access link opens: the degree, then its attestations.

    A university issues a degree plus any number of course grades, honors and
    activities in one go, and they all share this token's digest -- that shared
    digest IS the bundle; there is no parent pointer to keep in sync.
    """
    if not token or not token.strip():
        return _api_error(401, "UNAUTHENTICATED", "This page needs the access link the university gave you.")

    digest = hashlib.sha256(token.strip().encode()).hexdigest()
    try:
        items = await dynamo_client.scan_credentials()
    except dynamo_client.DynamoClientError:
        logger.exception("holder lookup failed")
        return _api_error(503, "CHAIN_UNAVAILABLE", "Could not read the credential index. Please try again.")

    matches = [
        item
        for item in items
        # compare_digest, not ==, so a timing signal cannot walk the token.
        # `or ""` makes rows predating holder links unmatchable rather than
        # matchable by an empty token.
        if hmac.compare_digest(item.holder_token_hash or "", digest)
    ]
    if not matches:
        return _api_error(404, *_NO_CREDENTIAL)

    # A scan returns rows in no particular order, so the degree is found by
    # what it is -- the row with no attestation kind -- not by position.
    matches.sort(key=lambda i: (i.created_at, i.credential_id))
    primary_index = next(
        (n for n, item in enumerate(matches) if item.attestation_kind is None), 0
    )
    matches.insert(0, matches.pop(primary_index))
    return matches


async def _resolve_credential(token: str | None) -> CredentialIndexItem | JSONResponse:
    """Just the degree. Used where a bundle would be meaningless."""
    bundle = await _resolve_bundle(token)
    return bundle if isinstance(bundle, JSONResponse) else bundle[0]


def _verify_url(credential_id: str, grant_id: str | None = None) -> str:
    base = f"{get_settings().verify_base_url.rstrip('/')}/verify/{credential_id}"
    return f"{base}?grant={grant_id}" if grant_id else base


def _grant_view(grant: dict) -> dict:
    return {
        "grantId": grant["grantId"],
        "revealGpa": grant.get("revealGpa", False),
        "createdAt": grant.get("createdAt"),
        "revoked": grant.get("revokedAt") is not None,
        "verifyUrl": _verify_url(grant["credentialId"], grant["grantId"]),
    }


async def _prove(credential_id: str) -> dict:
    """The holder's own credential, GPA included.

    The off-chain index deliberately stores no grades and no identity, so the
    only way to show a graduate their own GPA is to prove the credential — the
    same circuit a verifier runs, just with the holder as the audience.
    """
    result = await chain_service_client.verify_proof(
        credential_id=credential_id, proof_payload="", requested_fields=["gpa"]
    )
    return (result or {}).get("chain") or {}


def _credential_view(entry: CredentialIndexItem, chain: dict) -> dict:
    status = chain.get("status", "INVALID_PROOF")
    disclosed = chain.get("disclosed") or {}
    gpa_times_100 = disclosed.get("gpaTimes100")
    proof_succeeded = status == "VALID"

    # An attestation with no grade is stored on-chain as gpaTimes100 = 0,
    # because the field is not nullable there. For a course that means "no
    # grade recorded", not "scored zero", so it reads as absent. The degree
    # keeps the strict rule -- a 0.00 GPA on a degree is real data.
    if entry.attestation_kind is not None and gpa_times_100 == 0:
        gpa_times_100 = None

    return {
        "id": entry.credential_id,
        # Human-readable values come from the index; they describe a
        # credential that could not be proven only if the proof succeeded,
        # matching the public page's rule that a failed proof shows nothing.
        "institution": entry.university_id if proof_succeeded else None,
        "degree": entry.credential_type if proof_succeeded else None,
        "graduationYear": disclosed.get("graduationYear"),
        "gpa": (gpa_times_100 / 100) if gpa_times_100 is not None else None,
        "status": status,
        "issuedAt": entry.created_at.isoformat(),
        "verifyUrl": _verify_url(entry.credential_id),
    }


@router.get("/me")
async def get_my_credential(x_holder_token: str | None = Header(default=None, alias="X-Holder-Token")):
    bundle = await _resolve_bundle(x_holder_token)
    if isinstance(bundle, JSONResponse):
        return bundle

    # Gathered, unlike issuance, which is sequential. Proving is read-only and
    # submits no transaction, so there is nothing to contend over -- and a
    # graduate with four credentials should wait for one proof, not four.
    chains = await asyncio.gather(*(_prove(entry.credential_id) for entry in bundle))

    primary, *attestations = bundle
    return {
        # This shape predates attestations and is unchanged: everything below
        # is additive, so a client that never heard of attestations still sees
        # exactly the degree it saw before.
        "credential": _credential_view(primary, chains[0]),
        "grants": [_grant_view(g) for g in share_grants.list_grants(primary.credential_id)],
        "attestations": [
            {
                **_credential_view(entry, chain),
                "kind": entry.attestation_kind,
                "grants": [
                    _grant_view(g) for g in share_grants.list_grants(entry.credential_id)
                ],
            }
            for entry, chain in zip(attestations, chains[1:])
        ],
    }


class CreateGrantRequest(BaseModel):
    revealGpa: bool = False
    # Which credential in the bundle to share. Empty means the degree, so a
    # client written before attestations existed keeps working unchanged.
    credentialId: str = ""


@router.post("/grants", status_code=201)
async def create_grant(
    payload: CreateGrantRequest,
    x_holder_token: str | None = Header(default=None, alias="X-Holder-Token"),
):
    bundle = await _resolve_bundle(x_holder_token)
    if isinstance(bundle, JSONResponse):
        return bundle

    target = payload.credentialId.strip() or bundle[0].credential_id
    if target not in {entry.credential_id for entry in bundle}:
        # A credential this link does not open is reported exactly like a bad
        # token: the holder must not be able to use their own valid link to
        # learn whether some other credential id exists.
        return _api_error(404, *_NO_CREDENTIAL)

    grant = share_grants.create_grant(target, payload.revealGpa)
    return _grant_view(grant)


@router.delete("/grants/{grant_id}")
async def revoke_grant(
    grant_id: str,
    x_holder_token: str | None = Header(default=None, alias="X-Holder-Token"),
):
    bundle = await _resolve_bundle(x_holder_token)
    if isinstance(bundle, JSONResponse):
        return bundle

    # The grant belongs to exactly one credential in the bundle; which one is
    # not worth making the client tell us. revoke_grant only succeeds when the
    # id and the credential match, so this cannot revoke someone else's link.
    revoked = any(
        share_grants.revoke_grant(grant_id, entry.credential_id) for entry in bundle
    )
    if not revoked:
        # Unknown, already revoked, or someone else's — reported the same way.
        return _api_error(404, "NOT_FOUND", "No active share link with that id.")

    return {"grantId": grant_id, "revoked": True}


class ResumeCheckRequest(BaseModel):
    resumeText: str = ""


@router.post("/resume-check")
async def check_resume(
    payload: ResumeCheckRequest,
    x_holder_token: str | None = Header(default=None, alias="X-Holder-Token"),
):
    """Separate what a resume CLAIMS from what the credential PROVES.

    The model only extracts claims from text. Every verdict is decided
    afterwards by deterministic comparison against the proven credential, so a
    model that hallucinates a degree cannot cause one to be reported as proven.
    """
    text = (payload.resumeText or "").strip()
    if not text:
        return _api_error(400, "VALIDATION_ERROR", "Paste some resume text first.")
    if len(text) > _MAX_RESUME_CHARS:
        return _api_error(
            400, "VALIDATION_ERROR", f"That is longer than {_MAX_RESUME_CHARS:,} characters. Paste the education section."
        )

    entry = await _resolve_credential(x_holder_token)
    if isinstance(entry, JSONResponse):
        return entry

    chain = await _prove(entry.credential_id)
    status = chain.get("status", "INVALID_PROOF")
    if status != "VALID":
        # Nothing can be "proven against" a credential that does not verify.
        return _api_error(
            409,
            "CREDENTIAL_ALREADY_REVOKED" if status == "REVOKED" else "INVALID_PROOF",
            "This credential does not currently verify, so it cannot back any claim.",
        )

    disclosed = chain.get("disclosed") or {}
    gpa_times_100 = disclosed.get("gpaTimes100")
    proven = {
        "institution": entry.university_id or "",
        "degree": entry.credential_type or "",
        "graduationYear": disclosed.get("graduationYear"),
        "gpa": (gpa_times_100 / 100) if gpa_times_100 is not None else None,
    }

    try:
        claims = await gemini_client.extract_resume_claims(text)
    except gemini_client.GeminiUnavailableError:
        # Deliberately no partial results: a half-checked resume reads as a
        # verdict, and this is the one place the product must not bluff.
        logger.warning("resume extraction unavailable", exc_info=True)
        return _api_error(
            503,
            "AI_UNAVAILABLE",
            "The resume checker is unavailable right now. Nothing was checked — the credential itself is unaffected.",
        )

    checked = resume_match.match_claims(claims, proven)
    summary = {"proven": 0, "unproven": 0, "contradicted": 0}
    for claim in checked:
        summary[claim["verdict"]] = summary.get(claim["verdict"], 0) + 1

    return {"claims": checked, "summary": summary, "checkedAt": datetime.now(timezone.utc).isoformat()}
