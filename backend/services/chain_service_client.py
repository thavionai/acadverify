from __future__ import annotations

import hashlib
import logging
from typing import Any

import httpx

from core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


class ChainServiceError(Exception):
    """Base class for all errors"""


class ChainServiceUnavailableError(ChainServiceError):
    """handled in core.error_handlers"""


class ChainServiceRequestError(ChainServiceError):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"chain-service rejected request: {status_code} {detail}")


_client: httpx.AsyncClient | None = None

def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = _build_client()
    return _client


def _build_client() -> httpx.AsyncClient:
    timeout = httpx.Timeout(
        timeout=settings.chain_service_timeout_seconds,
        connect=settings.chain_service_connect_timeout_seconds,
    )
    return httpx.AsyncClient(
        base_url=settings.chain_service_url,
        timeout=timeout,
    )


async def startup() -> None:
    global _client
    _client = _build_client()
    logger.info("chain-service HTTP client initialized: %s", settings.chain_service_url)


async def shutdown() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def _request(method: str, path: str, **kwargs: Any) -> dict:
    client = get_client()
    try:
        resp = await client.request(method, path, **kwargs)
    except (httpx.ConnectTimeout, httpx.ConnectError) as exc:
        logger.error("chain-service connection failed: %s %s -> %s", method, path, exc)
        raise ChainServiceUnavailableError(f"could not connect to chain-service: {exc}") from exc
    except httpx.TimeoutException as exc:
        logger.error("chain-service timed out: %s %s -> %s", method, path, exc)
        raise ChainServiceUnavailableError(f"chain-service request timed out: {exc}") from exc
    except httpx.TransportError as exc:
        logger.error("chain-service transport error: %s %s -> %s", method, path, exc)
        raise ChainServiceUnavailableError(f"chain-service transport error: {exc}") from exc

    if resp.status_code >= 500:
        logger.error("chain-service 5xx: %s %s -> %s", method, path, resp.status_code)
        raise ChainServiceUnavailableError(
            f"chain-service returned {resp.status_code}: {resp.text[:500]}"
        )

    if resp.status_code >= 400:
        raise ChainServiceRequestError(resp.status_code, resp.text[:500])

    return resp.json()

def _hex32(*parts: str) -> str:
    """Opaque 32-byte hex identifier derived from human-readable parts.

    The chain contract only ever sees these digests (schemas.ts: studentId is
    "Opaque student identifier. NEVER a name."), so names and free-text IDs
    stay off-chain by construction.
    """
    return hashlib.sha256(":".join(parts).encode()).hexdigest()


async def authorize_issuer(issuer_identity: str) -> dict:
    """
    Register an institution as an authorised issuer ON-CHAIN.

    Nothing used to call this. `authorizeIssuer` existed as a circuit and as an
    HTTP route, and the only caller was a manual operator script — so
    "Submit for Review" in the dashboard wrote a database row marked AUTHORIZED
    while the chain knew nothing about the institution.

    chain-service derives the institution's key from this identity, so the
    backend never sees or handles a signing key.
    """
    result = await _request(
        "POST", "/chain/authorize-issuer", json={"institutionId": issuer_identity}
    )
    return result


async def issue_credential(
    credential_id: str,
    university_id: str,
    credential_type: str,
    witness: dict,
    issuer_identity: str,
) -> dict:
    # /chain/issue takes 32-byte hex identifiers and small integers only —
    # see midnight/chain-service/src/http/schemas.ts (the frozen contract).
    # Human-readable witness values are hashed or encoded here, never sent.
    graduation_date = str(witness.get("graduation_date") or "")
    year_prefix = graduation_date[:4]
    gpa = witness.get("gpa")
    payload = {
        "credentialId": credential_id,
        # WHO IS SIGNING. chain-service derives this institution's own key from
        # it. Previously every credential carried one global ISSUER_PK, so the
        # ledger recorded a single issuer no matter which university was logged
        # in — the contract is multi-tenant, the deployment was not.
        #
        # Distinct from fields.institutionId below, which is a digest of the
        # awarding institution's NAME and is a disclosed field, not a signer.
        "institutionId": issuer_identity,
        "fields": {
            "studentId": _hex32("student", str(witness.get("student_id", ""))),
            "institutionId": _hex32("institution", university_id),
            # Stable numeric code for the degree program (uint32 range).
            "degreeCode": int.from_bytes(
                hashlib.sha256(credential_type.encode()).digest()[:4], "big"
            ),
            "graduationYear": int(year_prefix) if year_prefix.isdigit() else 0,
            "gpaTimes100": round(gpa * 100) if gpa is not None else 0,
        },
    }
    result = await _request("POST", "/chain/issue", json=payload)
    # A 2xx means the credential was recorded; non-2xx raises above. The txId
    # is the durable pointer back into chain state.
    return {"status": "issued", "chain_proof_ref": result.get("txId"), "chain": result}


async def revoke_credential(
    credential_id: str,
    issuer_identity: str,
    reason: str | None = None,
) -> dict:
    # `reason` is kept for the backend's own audit trail; the chain contract
    # (RevokeRequestSchema) has no field for it and would strip it anyway.
    #
    # revokeCredential asserts the caller's key matches the one that issued
    # this credential, so passing the caller's identity is what lets that
    # assert do its job — a university cannot revoke another's credentials.
    payload = {"credentialId": credential_id, "institutionId": issuer_identity}
    result = await _request("POST", "/chain/revoke", json=payload)
    return {"revoked_at": result.get("revokedAt"), "chain": result}


async def get_proof_state(credential_id: str) -> dict:
    result = await _request("GET", f"/chain/state/{credential_id}")
    if result.get("revoked"):
        on_chain_status = "revoked"
    elif result.get("exists"):
        on_chain_status = "issued"
    else:
        on_chain_status = "unknown"
    return {"on_chain_status": on_chain_status, "chain": result}


# The only field the contract lets the holder optionally disclose
# (ProveRequestSchema's enum); everything else in the request would fail
# chain-service validation.
_CHAIN_DISCLOSE_FIELDS = frozenset({"gpa"})

_PROVE_STATUS_TO_ON_CHAIN = {"VALID": "issued", "REVOKED": "revoked"}


async def verify_proof(credential_id: str, proof_payload: str, requested_fields: list[str]) -> dict:
    # proof_payload is not forwarded: the proof material lives in the
    # chain-service's private-state vault and is re-derived there. The
    # parameter stays so the public API contract is unchanged.
    payload = {
        "credentialId": credential_id,
        "disclose": [f for f in requested_fields if f in _CHAIN_DISCLOSE_FIELDS],
    }
    result = await _request("POST", "/chain/prove", json=payload)
    chain_status = result.get("status")
    disclosed_raw = result.get("disclosed") or {}
    return {
        "valid": chain_status == "VALID",
        "on_chain_status": _PROVE_STATUS_TO_ON_CHAIN.get(chain_status, "unknown"),
        # Withheld fields come back as null — drop them instead of leaking a
        # literal "None" string to the verifier.
        "disclosed": {k: str(v) for k, v in disclosed_raw.items() if v is not None},
        "chain": result,
    }


