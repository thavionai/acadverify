"""
Regression tests for grant-only GPA disclosure.

The defect these pin: `/verify/{id}?disclose=gpa` was a public query parameter,
so any verifier holding a link could reveal that credential's GPA. Disclosure
now requires a live grant minted by the holder.

The first test is the one that matters most -- it fails loudly if the old
behaviour ever returns.
"""

from __future__ import annotations

import json

import pytest

from core import share_grants
from routers import portal


class _StubIndexEntry:
    university_id = "North Valley University"
    credential_type = "Master of Artificial Intelligence"


class _StubRequest:
    class client:
        host = "127.0.0.1"

    headers: dict[str, str] = {}


def _chain_response(status: str = "VALID", *, reveal_gpa: bool = False) -> dict:
    """Shaped like chain-service's own reply (see its chain/mock.ts)."""
    disclosed = (
        {
            "institutionId": "a3f1" + "0" * 60,
            "degreeCode": 2047909550,
            "graduationYear": 2026,
            "gpaTimes100": 390 if reveal_gpa else None,
        }
        if status == "VALID"
        else None
    )
    withheld = (
        ["studentId"] + ([] if reveal_gpa else ["gpa"])
        if disclosed
        else ["studentId", "gpa", "institutionId", "degreeCode", "graduationYear"]
    )
    return {
        "chain": {
            "status": status,
            "disclosed": disclosed,
            "withheld": withheld,
            "evidence": {"networkId": "undeployed", "contractAddress": "mock", "issuanceTxId": "tx"},
            "proof": {"verified": status == "VALID"},
        }
    }


@pytest.fixture
def isolated_store(monkeypatch, tmp_path):
    """Point the grant store at a temp file so tests never touch the real one."""
    monkeypatch.setenv("SHARE_GRANT_STORE_PATH", str(tmp_path / "grants.json"))


@pytest.fixture
def patched(monkeypatch, isolated_store):
    """Install the dynamo stub, and return a closure that installs the chain
    stub while recording what disclosure the endpoint asked for."""
    seen: dict[str, list[str]] = {}

    async def _get_index(_credential_id):
        return _StubIndexEntry()

    monkeypatch.setattr(portal.dynamo_client, "get_credential_index", _get_index)

    def _install(status: str = "VALID"):
        async def _verify_proof(**kwargs):
            seen["requested_fields"] = kwargs["requested_fields"]
            return _chain_response(status, reveal_gpa="gpa" in kwargs["requested_fields"])

        monkeypatch.setattr(portal.chain_service_client, "verify_proof", _verify_proof)
        return seen

    return _install


def _body(response) -> dict:
    return json.loads(response.body)


async def test_disclose_gpa_alone_never_discloses_gpa(patched):
    """THE regression. A verifier asking for the GPA is not consent."""
    seen = patched()

    result = await portal.verify_credential_public("cred-1", _StubRequest(), "gpa")

    assert seen["requested_fields"] == [], "the chain must not even be asked for the gpa"
    assert result["disclosed"]["gpa"] is None
    assert "gpa" in result["withheld"]


async def test_valid_grant_discloses_gpa(patched):
    seen = patched()
    grant = share_grants.create_grant("cred-1", reveal_gpa=True)

    result = await portal.verify_credential_public("cred-1", _StubRequest(), "", grant["grantId"])

    assert seen["requested_fields"] == ["gpa"]
    assert result["disclosed"]["gpa"] == pytest.approx(3.9)
    assert "gpa" not in result["withheld"]


async def test_grant_without_reveal_gpa_keeps_it_withheld(patched):
    """A grant is not a blanket permission -- it carries what was agreed."""
    patched()
    grant = share_grants.create_grant("cred-1", reveal_gpa=False)

    result = await portal.verify_credential_public("cred-1", _StubRequest(), "", grant["grantId"])

    assert result["disclosed"]["gpa"] is None
    assert "gpa" in result["withheld"]


async def test_unknown_grant_is_rejected(patched):
    patched()

    response = await portal.verify_credential_public("cred-1", _StubRequest(), "", "no-such-grant")

    assert response.status_code == 404
    assert _body(response)["error"]["code"] == "GRANT_NOT_FOUND"


async def test_revoked_grant_is_indistinguishable_from_an_unknown_one(patched):
    """A verifier must not be able to tell 'revoked' from 'never existed' --
    that difference leaks whether the holder ever shared with someone."""
    patched()
    grant = share_grants.create_grant("cred-1", reveal_gpa=True)
    share_grants.revoke_grant(grant["grantId"], "cred-1")

    revoked = await portal.verify_credential_public("cred-1", _StubRequest(), "", grant["grantId"])
    unknown = await portal.verify_credential_public("cred-1", _StubRequest(), "", "no-such-grant")

    assert revoked.status_code == unknown.status_code == 404
    assert revoked.body == unknown.body, "the two failures must be byte-identical"


async def test_a_grant_for_another_credential_does_not_unlock_this_one(patched):
    """Grants are bound to one credential; presenting someone else's must not
    disclose, and must not reveal that it was the binding that failed."""
    patched()
    other = share_grants.create_grant("cred-2", reveal_gpa=True)

    response = await portal.verify_credential_public("cred-1", _StubRequest(), "", other["grantId"])
    unknown = await portal.verify_credential_public("cred-1", _StubRequest(), "", "no-such-grant")

    assert response.status_code == 404
    assert response.body == unknown.body


async def test_revoking_twice_is_not_an_error_the_second_time(isolated_store):
    grant = share_grants.create_grant("cred-1", reveal_gpa=True)

    assert share_grants.revoke_grant(grant["grantId"], "cred-1") is True
    assert share_grants.revoke_grant(grant["grantId"], "cred-1") is False


async def test_revoking_another_credentials_grant_fails(isolated_store):
    grant = share_grants.create_grant("cred-1", reveal_gpa=True)

    assert share_grants.revoke_grant(grant["grantId"], "cred-2") is False
    assert share_grants.get_active_grant(grant["grantId"]) is not None, "must remain live"


async def test_list_grants_includes_revoked_ones(isolated_store):
    """The holder should be able to see what they revoked, not just what is live."""
    live = share_grants.create_grant("cred-1", reveal_gpa=True)
    gone = share_grants.create_grant("cred-1", reveal_gpa=False)
    share_grants.revoke_grant(gone["grantId"], "cred-1")

    listed = {g["grantId"]: g for g in share_grants.list_grants("cred-1")}

    assert set(listed) == {live["grantId"], gone["grantId"]}
    assert listed[gone["grantId"]]["revokedAt"] is not None


async def test_a_corrupt_store_fails_closed(isolated_store, tmp_path, monkeypatch):
    """An unreadable store must disclose nothing rather than everything."""
    (tmp_path / "grants.json").write_text("{ not json", encoding="utf-8")

    assert share_grants.get_active_grant("anything") is None
    assert share_grants.list_grants("cred-1") == []
