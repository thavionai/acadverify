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