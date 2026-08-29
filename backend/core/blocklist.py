from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from core.client_ip import get_client_ip
from core.config import get_settings

logger = logging.getLogger(__name__)

# "the backend enforces it ... re-reads the file at most once per second"
_CACHE_TTL_SECONDS = 1.0

_cache: dict[str, float] = {}
_cache_loaded_at: float = 0.0
_have_loaded_once: bool = False

# Paths exempt from blocklist enforcement even if the caller's IP is
# listed. Liveness probes come from fixed infra IPs that have nothing to
# do with verification abuse, and shouldn't be collateral damage.
_EXEMPT_PATHS = frozenset({"/healthz"})


def _read_blocklist_file() -> dict[str, float]:
    path = Path(get_settings().blocklist_file_path)
    data = json.loads(path.read_text())
    return {str(ip): float(ts) for ip, ts in data.items()}


def load_blocklist() -> dict[str, float]:
    """Cached read of the blocklist file, refreshed at most once/sec."""
    global _cache, _cache_loaded_at, _have_loaded_once

    now = time.monotonic()
    if _have_loaded_once and (now - _cache_loaded_at) < _CACHE_TTL_SECONDS:
        return _cache

    try:
        _cache = _read_blocklist_file()
        _have_loaded_once = True
    except FileNotFoundError:
        # Normal in local dev without the observability compose project
        # running — there's simply nothing to enforce yet.
        if not _have_loaded_once:
            _cache = {}
    except (json.JSONDecodeError, OSError, ValueError) as exc:
        logger.warning("Could not read blocklist file, keeping previous snapshot: %s", exc)
        if not _have_loaded_once:
            _cache = {}

    _cache_loaded_at = now
    return _cache


def is_blocked(ip: str) -> bool:
    return ip in load_blocklist()


async def enforce_blocklist(request: Request, call_next):
    if request.url.path in _EXEMPT_PATHS:
        return await call_next(request)

    client_ip = get_client_ip(request)
    if is_blocked(client_ip):
        logger.info(
            "Rejected request from blocklisted IP %s: %s %s",
            client_ip, request.method, request.url.path,
        )
        return JSONResponse({"error": {"code": "RATE_LIMITED"}}, status_code=429)

    return await call_next(request)


def register_blocklist_middleware(app: FastAPI) -> None:
    app.middleware("http")(enforce_blocklist)


def _reset_cache_for_tests() -> None:
    global _cache, _cache_loaded_at, _have_loaded_once
    _cache = {}
    _cache_loaded_at = 0.0
    _have_loaded_once = False
