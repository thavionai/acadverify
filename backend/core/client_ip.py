from __future__ import annotations

from fastapi import Request

from core.config import get_settings


def get_client_ip(request: Request) -> str:
    settings = get_settings()
    if settings.trust_x_forwarded_for:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            parts = [p.strip() for p in xff.split(",") if p.strip()]
            if parts:
                return parts[-1]
    return request.client.host if request.client else "unknown"