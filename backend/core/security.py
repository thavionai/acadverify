from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from core.config import get_settings

API_KEY_HEADER_NAME = "X-API-Key"


def _constant_time_in(candidate: str, valid_keys: set[str]) -> bool:
    matched = False
    for key in valid_keys:
        if hmac.compare_digest(candidate, key):
            matched = True
    return matched


async def require_admin_api_key(
    x_api_key: str | None = Header(default=None, alias=API_KEY_HEADER_NAME),
) -> str:
    """
    FastAPI dependency. Raises 401 if missing/invalid. Returns the valid
    key on success (useful if you later want to log/attribute which
    university's key was used, without storing it anywhere).
    """
    settings = get_settings()
    valid_keys = settings.admin_api_key_set

    if not valid_keys:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin authentication is not configured.",
        )

    if not x_api_key or not _constant_time_in(x_api_key, valid_keys):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key.",
            headers={"WWW-Authenticate": API_KEY_HEADER_NAME},
        )

    return x_api_key
