from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from services.chain_service_client import (
    ChainServiceRequestError,
    ChainServiceUnavailableError,
)

logger = logging.getLogger(__name__)


async def chain_service_unavailable_handler(
    request: Request, exc: ChainServiceUnavailableError
) -> JSONResponse:
    logger.error("chain-service unavailable during %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "error": "chain_service_unavailable",
            "detail": (
                "The credential ledger service is temporarily unreachable. "
                "This is a connectivity issue, not a statement about the "
                "validity of any credential. Please retry shortly."
            ),
        },
        headers={"Retry-After": "5"},
    )


async def chain_service_request_error_handler(
    request: Request, exc: ChainServiceRequestError
) -> JSONResponse:
    logger.warning(
        "chain-service rejected request during %s %s: %s %s",
        request.method, request.url.path, exc.status_code, exc.detail,
    )
    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content={
            "error": "chain_service_rejected_request",
            "detail": exc.detail,
        },
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ChainServiceUnavailableError, chain_service_unavailable_handler)
    app.add_exception_handler(ChainServiceRequestError, chain_service_request_error_handler)