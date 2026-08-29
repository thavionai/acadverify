from __future__ import annotations

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




async def issue_credential(
    credential_id: str,
    university_id: str,
    credential_type: str,
    witness: dict,
) -> dict:
    payload = {
        "credential_id": credential_id,
        "university_id": university_id,
        "credential_type": credential_type,
        "witness": witness,
    }
    return await _request("POST", "/internal/credentials/issue", json=payload)


async def revoke_credential(credential_id: str, reason: str | None = None) -> dict:

    payload = {"credential_id": credential_id, "reason": reason}
    return await _request("POST", "/internal/credentials/revoke", json=payload)


async def get_proof_state(credential_id: str) -> dict:

    return await _request("GET", f"/internal/credentials/{credential_id}/proof-state")


async def verify_proof(credential_id: str, proof_payload: str, requested_fields: list[str]) -> dict:

    payload = {
        "credential_id": credential_id,
        "proof_payload": proof_payload,
        "requested_fields": requested_fields,
    }
    return await _request("POST", "/internal/credentials/verify", json=payload)
