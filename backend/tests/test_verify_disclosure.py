"""Regression tests for a QA1 finding about fabricated disclosure data.

`GET /verify/{id}` built its `disclosed` block with `.get(key, 0)` defaults
against `raw.get("disclosed") or {}`. When a proof does not succeed the chain
discloses NOTHING (`disclosed: null`) — for REVOKED and INVALID_PROOF alike —
so those defaults invented data: a revoked or forged credential was rendered
with "Degree Code 0" and "Graduation Year 0" under the heading *Disclosed
Fields*, beside a genuine institution and degree pulled from the off-chain
index. Absent is not zero.

Separately, `withheld` was forwarded verbatim from chain-service, which derives
it from CONSENT alone. On a revoked credential where the holder HAD consented to
GPA, gpa ended up in neither list — null in `disclosed`, absent from `withheld`.

The invariant pinned here: every chain-disclosable field appears in exactly one
of `disclosed` (with a real value) or `withheld`.
"""

from __future__ import annotations

import pytest

from routers import portal

CHAIN_DISCLOSABLE = ("institutionId", "degreeCode", "graduationYear", "gpa")


class _StubIndexEntry:
    university_id = "North Valley University"
    credential_type = "Master of Artificial Intelligence"


class _StubRequest:
    class client:
        host = "127.0.0.1"

    headers: dict[str, str] = {}


def _chain_response(status: str, *, reveal_gpa: bool) -> dict:
    """What chain-service actually returns (see its chain/mock.ts)."""
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
def patched(monkeypatch):
    """Stub the two I/O boundaries so these stay pure unit tests."""

    async def _get_index(_credential_id):
        return _StubIndexEntry()

    monkeypatch.setattr(portal.dynamo_client, "get_credential_index", _get_index)

    def _install(status: str, reveal_gpa: bool):
        async def _verify_proof(**_kwargs):
            return _chain_response(status, reveal_gpa=reveal_gpa)

        monkeypatch.setattr(portal.chain_service_client, "verify_proof", _verify_proof)

    return _install


@pytest.mark.parametrize("status", ["REVOKED", "INVALID_PROOF"])
@pytest.mark.parametrize("disclose", ["", "gpa"])
async def test_failed_proof_never_fabricates_zeros(patched, status, disclose):
    """A proof that disclosed nothing must not report zeros as disclosed data."""
    patched(status, reveal_gpa=(disclose == "gpa"))

    result = await portal.verify_credential_public("cred-1", _StubRequest(), disclose)

    assert result["disclosed"]["degreeCode"] is None, "0 is real data; absent must be null"
    assert result["disclosed"]["graduationYear"] is None
    assert result["disclosed"]["institutionId"] is None


@pytest.mark.parametrize("status", ["VALID", "REVOKED", "INVALID_PROOF"])
@pytest.mark.parametrize("disclose", ["", "gpa"])
async def test_every_field_is_disclosed_or_withheld_never_neither(patched, status, disclose):
    patched(status, reveal_gpa=(disclose == "gpa"))

    result = await portal.verify_credential_public("cred-1", _StubRequest(), disclose)
    disclosed, withheld = result["disclosed"], result["withheld"]

    for field in CHAIN_DISCLOSABLE:
        shown = disclosed.get(field) is not None
        hidden = field in withheld
        assert shown or hidden, f"{field} is in neither disclosed nor withheld ({status}/{disclose})"
        assert not (shown and hidden), f"{field} is in both ({status}/{disclose})"


async def test_revoked_with_gpa_consent_still_reports_gpa_withheld(patched):
    """The exact case that regressed: consent removed gpa from `withheld`, and
    revocation removed it from `disclosed`, so it vanished from both."""
    patched("REVOKED", reveal_gpa=True)

    result = await portal.verify_credential_public("cred-1", _StubRequest(), "gpa")

    assert result["disclosed"]["gpa"] is None
    assert "gpa" in result["withheld"]


async def test_valid_proof_still_discloses_real_values(patched):
    """The fix must not over-withhold: a successful proof genuinely discloses."""
    patched("VALID", reveal_gpa=True)

    result = await portal.verify_credential_public("cred-1", _StubRequest(), "gpa")

    assert result["status"] == "VALID"
    assert result["disclosed"]["degreeCode"] == 2047909550
    assert result["disclosed"]["graduationYear"] == 2026
    assert result["disclosed"]["gpa"] == pytest.approx(3.9)
    assert result["withheld"] == ["studentId"]


async def test_a_real_zero_gpa_is_disclosed_not_treated_as_absent(patched, monkeypatch):
    """0.00 is a fact about a credential, not a missing value.

    Guards against 'fixing' the zero bug with a falsiness check.
    """

    async def _verify_proof(**_kwargs):
        payload = _chain_response("VALID", reveal_gpa=True)
        payload["chain"]["disclosed"]["gpaTimes100"] = 0
        return payload

    monkeypatch.setattr(portal.chain_service_client, "verify_proof", _verify_proof)

    result = await portal.verify_credential_public("cred-1", _StubRequest(), "gpa")

    assert result["disclosed"]["gpa"] == 0
    assert "gpa" not in result["withheld"], "a disclosed 0.00 GPA must not be reported as withheld"
