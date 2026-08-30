"""
Share grants — the record of what a credential HOLDER agreed to disclose.

Until now the verifier chose: `/verify/{id}?disclose=gpa` was a public query
parameter, so anyone holding a verification link could reveal the GPA by
clicking a toggle. The product's central claim — that the graduate decides what
a verifier sees — was not true of the software.

A grant moves that decision to the holder. They mint one from their own access
link, hand the resulting URL to a specific verifier, and can revoke it later.
The verify endpoint discloses the GPA only when a live grant says so.

Storage is a small JSON file, the same demo-grade posture as the institution
profile store in routers/portal.py: no locking, not safe for concurrent
writers, and fine for a single-process local stack. Unlike that store this one
re-reads the file on every access rather than caching at import — the file is
tiny, and it keeps tests honest (point SHARE_GRANT_STORE_PATH at a tmp_path and
every call sees it).
"""

from __future__ import annotations

import json
import logging
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


def _store_path() -> Path:
    # Read lazily rather than at import so tests can repoint it per-test.
    return Path(os.environ.get("SHARE_GRANT_STORE_PATH", ".share-grants.json"))


def _load() -> dict[str, dict]:
    """Never raises. A missing or corrupt store reads as 'no grants', which
    fails closed: verification falls back to disclosing nothing."""
    try:
        with _store_path().open(encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        logger.warning("share-grant store unreadable; treating as empty", exc_info=True)
        return {}


def _save(grants: dict[str, dict]) -> None:
    """Warn-only, like the profile store: a failed write degrades to
    in-process-only rather than failing the request the holder just made."""
    try:
        _store_path().write_text(json.dumps(grants, indent=2), encoding="utf-8")
    except OSError:
        logger.warning("could not persist share grants", exc_info=True)


def create_grant(credential_id: str, reveal_gpa: bool) -> dict:
    """Mint a grant for one credential. The id is 128 bits of urandom: it
    travels in a URL a verifier receives, so it must not be guessable."""
    grant_id = secrets.token_urlsafe(16)
    record = {
        "grantId": grant_id,
        "credentialId": credential_id,
        "revealGpa": bool(reveal_gpa),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "revokedAt": None,
    }
    grants = _load()
    grants[grant_id] = record
    _save(grants)
    return record


def get_active_grant(grant_id: str) -> dict | None:
    """The grant if it exists and has not been revoked, else None.

    Callers must treat None and 'belongs to another credential' identically —
    see routers/portal.py — so a verifier cannot probe whether a given grant
    ever existed.
    """
    grant = _load().get(grant_id)
    if grant is None or grant.get("revokedAt") is not None:
        return None
    return grant


def list_grants(credential_id: str) -> list[dict]:
    """Every grant ever minted for this credential, newest first, including
    revoked ones — the holder should be able to see what they have revoked."""
    grants = [g for g in _load().values() if g.get("credentialId") == credential_id]
    return sorted(grants, key=lambda g: g.get("createdAt") or "", reverse=True)


def revoke_grant(grant_id: str, credential_id: str) -> bool:
    """Revoke, but only if this credential owns the grant. Returns False for a
    grant that is unknown, already revoked, or belongs to someone else — the
    caller reports all three the same way."""
    grants = _load()
    grant = grants.get(grant_id)
    if grant is None or grant.get("credentialId") != credential_id:
        return False
    if grant.get("revokedAt") is not None:
        return False

    grant["revokedAt"] = datetime.now(timezone.utc).isoformat()
    _save(grants)
    return True
