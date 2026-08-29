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


ISSUER_HEADER_NAME = "X-Issuer-Address"


async def require_issuer_address(
    x_issuer_address: str | None = Header(default=None, alias=ISSUER_HEADER_NAME),
) -> str:
    """
    MVP issuer identity: the dashboard sends the connected wallet's public
    address in X-Issuer-Address (see frontend/lib/api.ts issuerHeaders).
    Signature verification of that address is a stretch goal — until then
    this only establishes *which* issuer is acting, not proof of key
    ownership. Never treat it as strong auth outside local/demo setups.
    """
    if not x_issuer_address or not x_issuer_address.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing issuer identity.",
            headers={"WWW-Authenticate": ISSUER_HEADER_NAME},
        )
    return x_issuer_address.strip()


async def require_admin_or_issuer(
    x_api_key: str | None = Header(default=None, alias=API_KEY_HEADER_NAME),
    x_issuer_address: str | None = Header(default=None, alias=ISSUER_HEADER_NAME),
) -> str:
    """Accept either the admin API key or the dashboard's issuer header."""
    if x_issuer_address and x_issuer_address.strip():
        return x_issuer_address.strip()
    return await require_admin_api_key(x_api_key)
