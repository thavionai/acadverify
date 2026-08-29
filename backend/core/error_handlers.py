from __future__ import annotations

import json
import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from services.chain_service_client import (
    ChainServiceRequestError,
    ChainServiceUnavailableError,
)

logger = logging.getLogger(__name__)


def _envelope(code: str, message: str) -> dict:
    """The error shape docs/api-spec.md mandates at every layer.

    frontend/lib/api.ts only reads `error` when it is an OBJECT; a bare string
    makes it discard the payload and fall back to guessing from the HTTP status.
    """
    return {"error": {"code": code, "message": message}}


def _unwrap_chain_error(detail: str) -> tuple[str, str] | None:
    """Recover the {code, message} chain-service already sent.

    chain-service emits the spec envelope correctly; this backend was wrapping
    it in an opaque string and throwing the real code away. `detail` is the raw
    upstream body (truncated to 500 chars at the call site), so parsing can
    legitimately fail — callers fall back rather than raising.
    """
    try:
        payload = json.loads(detail)
    except (ValueError, TypeError):
        return None
    inner = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(inner, dict) and inner.get("code"):
        return str(inner["code"]), str(inner.get("message") or "")
    return None


async def chain_service_unavailable_handler(
    request: Request, exc: ChainServiceUnavailableError
) -> JSONResponse:
    logger.error("chain-service unavailable during %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content=_envelope(
            "CHAIN_UNAVAILABLE",
            "The credential ledger service is temporarily unreachable. "
            "This is a connectivity issue, not a statement about the "
            "validity of any credential. Please retry shortly.",
        ),
        headers={"Retry-After": "5"},
    )


async def chain_service_request_error_handler(
    request: Request, exc: ChainServiceRequestError
) -> JSONResponse:
    logger.warning(
        "chain-service rejected request during %s %s: %s %s",
        request.method, request.url.path, exc.status_code, exc.detail,
    )
    # A chain-service 4xx is a statement about the REQUEST (credential not
    # found, issuer not authorized, already revoked). Re-rendering it as a 502
    # told the verifier our infrastructure was broken instead — the inverse of
    # the rule docs/api-spec.md sets out, and it hid the real cause: the code
    # was still there, buried inside an escaped `detail` string that
    # frontend/lib/api.ts discards because `error` was not an object.
    #
    # This is reachable in ordinary use: mock chain-service state is in-memory,
    # so any chain-service restart orphans previously-issued credentials, and
    # every lookup of one returned "502 service outage" instead of "not found".
    #
    # A chain-service 5xx genuinely IS our failure, so that stays a 503.
    unwrapped = _unwrap_chain_error(exc.detail)

    if exc.status_code >= 500:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=_envelope(
                "CHAIN_UNAVAILABLE",
                "The credential ledger service failed to process the request. "
                "This is a service issue, not a statement about the validity "
                "of any credential.",
            ),
            headers={"Retry-After": "5"},
        )

    if unwrapped is None:
        # Preserve the upstream status even when the body is unparseable —
        # guessing 502 would still misattribute a client error to our infra.
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope("UNKNOWN_ERROR", "The request could not be completed."),
        )

    code, message = unwrapped
    return JSONResponse(status_code=exc.status_code, content=_envelope(code, message))


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ChainServiceUnavailableError, chain_service_unavailable_handler)
    app.add_exception_handler(ChainServiceRequestError, chain_service_request_error_handler)