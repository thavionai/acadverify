"""
The graduate's own surface: access by possession of a secret link.

These pin the two properties that make that safe -- the token is never stored,
and every way a lookup can fail looks identical from outside.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

import pytest

from core import share_grants
from models.schemas import CredentialIndexItem, CredentialStatus
from routers import holder


def _index_item(token: str | None = None, credential_id: str = "cred-1") -> CredentialIndexItem:
    now = datetime.now(timezone.utc)
    return CredentialIndexItem(
        credential_id=credential_id,
        university_id="North Valley University",
        issuer_address="mn_shield-addr1_issuer",
        holder_token_hash=hashlib.sha256(token.encode()).hexdigest() if token else None,
        status=CredentialStatus.ISSUED,
        created_at=now,
        updated_at=now,
        credential_type="Master of Artificial Intelligence",
    )


def _chain(status: str = "VALID", gpa_times_100: int | None = 390) -> dict:
    disclosed = (
        {"institutionId": "a3f1", "degreeCode": 1, "graduationYear": 2026, "gpaTimes100": gpa_times_100}
        if status == "VALID"
        else None
    )
    return {"chain": {"status": status, "disclosed": disclosed, "withheld": [], "evidence": {}, "proof": {}}}


@pytest.fixture
def isolated_store(monkeypatch, tmp_path):
    monkeypatch.setenv("SHARE_GRANT_STORE_PATH", str(tmp_path / "grants.json"))


@pytest.fixture
def stack(monkeypatch, isolated_store):
    """Wire the holder router to a single in-memory credential."""

    def _install(items: list[CredentialIndexItem], status: str = "VALID", gpa: int | None = 390):
        async def _scan():
            return items

        async def _verify_proof(**_kwargs):
            return _chain(status, gpa)

        monkeypatch.setattr(holder.dynamo_client, "scan_credentials", _scan)
        monkeypatch.setattr(holder.chain_service_client, "verify_proof", _verify_proof)

    return _install


def _body(response) -> dict:
    return json.loads(response.body)


async def test_holder_sees_their_own_credential_and_gpa(stack):
    """The index stores no grades, so the only honest source is the circuit."""
    stack([_index_item("tok-abc")])

    result = await holder.get_my_credential("tok-abc")

    assert result["credential"]["institution"] == "North Valley University"
    assert result["credential"]["gpa"] == pytest.approx(3.9)
    assert result["credential"]["status"] == "VALID"
    assert result["grants"] == []


async def test_every_failed_lookup_looks_the_same(stack):
    """A wrong token, and a token against an empty index, must be
    indistinguishable -- otherwise the response tells an attacker whether a
    guess matched some credential."""
    stack([_index_item("tok-abc")])
    wrong = await holder.get_my_credential("tok-xyz")

    stack([])
    nothing_at_all = await holder.get_my_credential("tok-xyz")

    assert wrong.status_code == nothing_at_all.status_code == 404
    assert wrong.body == nothing_at_all.body


async def test_credentials_issued_before_holder_links_can_never_match(stack):
    """A legacy row has no token hash. `or ""` must make it unmatchable rather
    than matchable by an empty or whitespace token."""
    stack([_index_item(None)])

    for attempt in ("", "   ", "anything", hashlib.sha256(b"").hexdigest()):
        response = await holder.get_my_credential(attempt)
        assert response.status_code in (401, 404)


async def test_missing_token_header_is_unauthenticated(stack):
    stack([_index_item("tok-abc")])

    response = await holder.get_my_credential(None)

    assert response.status_code == 401
    assert _body(response)["error"]["code"] == "UNAUTHENTICATED"


async def test_holder_creates_and_revokes_a_share_link(stack):
    stack([_index_item("tok-abc")])

    created = await holder.create_grant(holder.CreateGrantRequest(revealGpa=True), "tok-abc")
    assert created["revealGpa"] is True
    assert created["revoked"] is False
    assert f"grant={created['grantId']}" in created["verifyUrl"]

    listed = await holder.get_my_credential("tok-abc")
    assert [g["grantId"] for g in listed["grants"]] == [created["grantId"]]

    revoked = await holder.revoke_grant(created["grantId"], "tok-abc")
    assert revoked == {"grantId": created["grantId"], "revoked": True}
    assert share_grants.get_active_grant(created["grantId"]) is None


async def test_a_holder_cannot_revoke_another_credentials_grant(stack):
    stack([_index_item("tok-abc", credential_id="cred-1")])
    someone_else = share_grants.create_grant("cred-2", reveal_gpa=True)

    response = await holder.revoke_grant(someone_else["grantId"], "tok-abc")

    assert response.status_code == 404
    assert share_grants.get_active_grant(someone_else["grantId"]) is not None


async def test_a_revoked_credential_shows_no_fields(stack):
    """Same rule as the public page: a proof that did not succeed discloses
    nothing, even to the holder."""
    stack([_index_item("tok-abc")], status="REVOKED", gpa=None)

    result = await holder.get_my_credential("tok-abc")

    assert result["credential"]["status"] == "REVOKED"
    assert result["credential"]["institution"] is None
    assert result["credential"]["gpa"] is None


async def test_issuance_returns_a_hold_url_and_stores_only_its_hash(monkeypatch):
    """The access token is returned exactly once and never persisted.

    A leaked credential index must not be convertible back into working access
    links, so only the digest is stored -- and the raw token must appear
    nowhere in the row.
    """
    from routers import portal

    written: dict[str, CredentialIndexItem] = {}

    async def _issue(**_kwargs):
        return {"status": "issued", "chain_proof_ref": "tx-1", "chain": {"commitment": "c0ffee"}}

    async def _upload(_credential_id, _png):
        return ("qr/key.png", "http://minio/qr/key.png")

    async def _put(item):
        written["item"] = item
        return item

    monkeypatch.setattr(portal.chain_service_client, "issue_credential", _issue)
    monkeypatch.setattr(portal.s3_client, "upload_qr_code", _upload)
    monkeypatch.setattr(portal.dynamo_client, "put_credential_index", _put)
    monkeypatch.setitem(portal._institution_profiles, "issuer-1", {"status": "AUTHORIZED", "issuerPk": "pk"})

    payload = portal.PortalIssueRequest(
        studentName="Ada Lovelace",
        studentId="S-1",
        degree="BSc Computer Science",
        institution="North Valley University",
        major="CS",
        graduationDate="2026-06-15",
        honors="",
        gpa="3.90",
    )
    result = await portal.issue_credential_portal(payload, "issuer-1")

    assert "holdUrl" in result and "/hold/" in result["holdUrl"]
    token = result["holdUrl"].rsplit("/hold/", 1)[1]
    assert len(token) >= 40, "a guessable access token is not access control"

    item = written["item"]
    assert item.holder_token_hash == hashlib.sha256(token.encode()).hexdigest()

    # The raw token must not have leaked into any stored field.
    assert token not in json.dumps(item.model_dump(mode="json"))
    # Nor the student's name -- the index has never stored identity.
    assert "Ada Lovelace" not in json.dumps(item.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Bundles: a degree plus everything else the university attested
# ---------------------------------------------------------------------------

def _attestation(
    token: str,
    credential_id: str,
    kind: str = "course",
    label: str = "Course · Algorithms",
) -> CredentialIndexItem:
    item = _index_item(token, credential_id)
    item.credential_type = label
    item.attestation_kind = kind
    return item


@pytest.fixture
def bundle_stack(monkeypatch, isolated_store):
    """Like `stack`, but proves each credential independently."""

    def _install(items: list[CredentialIndexItem], chains: dict[str, dict]):
        async def _scan():
            return items

        async def _verify_proof(credential_id, **_kwargs):
            return chains[credential_id]

        monkeypatch.setattr(holder.dynamo_client, "scan_credentials", _scan)
        monkeypatch.setattr(holder.chain_service_client, "verify_proof", _verify_proof)

    return _install


async def test_one_link_opens_the_degree_and_every_attestation(bundle_stack):
    bundle_stack(
        [
            _index_item("tok", "degree-1"),
            _attestation("tok", "att-1", "course", "Course · Algorithms"),
            _attestation("tok", "att-2", "honor", "Honor · Deans List"),
        ],
        {
            "degree-1": _chain(gpa_times_100=390),
            "att-1": _chain(gpa_times_100=380),
            "att-2": _chain(gpa_times_100=0),
        },
    )

    result = await holder.get_my_credential("tok")

    assert result["credential"]["id"] == "degree-1"
    assert [a["id"] for a in result["attestations"]] == ["att-1", "att-2"]
    assert [a["kind"] for a in result["attestations"]] == ["course", "honor"]
    assert result["attestations"][0]["degree"] == "Course · Algorithms"


async def test_the_degree_is_the_primary_whatever_order_the_scan_returns(bundle_stack):
    """A scan has no ordering guarantee; the degree is found by what it is."""
    bundle_stack(
        [
            _attestation("tok", "att-1"),
            _attestation("tok", "att-2", "honor", "Honor · Deans List"),
            _index_item("tok", "degree-1"),
        ],
        {cid: _chain() for cid in ("degree-1", "att-1", "att-2")},
    )

    result = await holder.get_my_credential("tok")

    assert result["credential"]["id"] == "degree-1"
    assert len(result["attestations"]) == 2


async def test_a_gradeless_attestation_reads_as_no_grade_not_zero(bundle_stack):
    """
    The chain cannot store an absent number, so a course with no grade arrives
    as 0. Rendering that as 0.00 would libel the graduate.
    """
    bundle_stack(
        [
            _index_item("tok", "degree-1"),
            _attestation("tok", "att-1"),
        ],
        {"degree-1": _chain(gpa_times_100=0), "att-1": _chain(gpa_times_100=0)},
    )

    result = await holder.get_my_credential("tok")

    assert result["attestations"][0]["gpa"] is None
    # The degree keeps the strict reading: a 0.00 GPA there is real data.
    assert result["credential"]["gpa"] == 0.0


async def test_a_single_credential_still_answers_the_old_shape(bundle_stack):
    bundle_stack([_index_item("tok", "degree-1")], {"degree-1": _chain()})

    result = await holder.get_my_credential("tok")

    assert result["credential"]["id"] == "degree-1"
    assert result["grants"] == []
    assert result["attestations"] == []


async def test_each_attestation_carries_its_own_share_links(bundle_stack):
    bundle_stack(
        [_index_item("tok", "degree-1"), _attestation("tok", "att-1")],
        {"degree-1": _chain(), "att-1": _chain()},
    )

    await holder.create_grant(
        holder.CreateGrantRequest(revealGpa=True, credentialId="att-1"), "tok"
    )

    result = await holder.get_my_credential("tok")

    assert result["grants"] == [], "the degree has none"
    (grant,) = result["attestations"][0]["grants"]
    assert grant["revealGpa"] is True
    assert "att-1" in grant["verifyUrl"]


async def test_a_grant_defaults_to_the_degree(bundle_stack):
    bundle_stack(
        [_index_item("tok", "degree-1"), _attestation("tok", "att-1")],
        {"degree-1": _chain(), "att-1": _chain()},
    )

    grant = await holder.create_grant(holder.CreateGrantRequest(revealGpa=False), "tok")

    assert "degree-1" in grant["verifyUrl"]


async def test_a_credential_this_link_does_not_open_is_simply_not_found(bundle_stack):
    """
    A valid token must not become an oracle for which credential ids exist.
    """
    bundle_stack([_index_item("tok", "degree-1")], {"degree-1": _chain()})

    response = await holder.create_grant(
        holder.CreateGrantRequest(revealGpa=True, credentialId="someone-elses"), "tok"
    )

    assert response.status_code == 404
    assert _body(response)["error"]["message"] == holder._NO_CREDENTIAL[1]


async def test_revoking_finds_the_grant_anywhere_in_the_bundle(bundle_stack):
    bundle_stack(
        [_index_item("tok", "degree-1"), _attestation("tok", "att-1")],
        {"degree-1": _chain(), "att-1": _chain()},
    )
    grant = await holder.create_grant(
        holder.CreateGrantRequest(revealGpa=True, credentialId="att-1"), "tok"
    )

    result = await holder.revoke_grant(grant["grantId"], "tok")

    assert result["revoked"] is True
    assert share_grants.get_active_grant(grant["grantId"]) is None


async def test_a_revoked_attestation_grant_still_lists_as_revoked(bundle_stack):
    bundle_stack(
        [_index_item("tok", "degree-1"), _attestation("tok", "att-1")],
        {"degree-1": _chain(), "att-1": _chain()},
    )
    grant = await holder.create_grant(
        holder.CreateGrantRequest(revealGpa=True, credentialId="att-1"), "tok"
    )
    await holder.revoke_grant(grant["grantId"], "tok")

    result = await holder.get_my_credential("tok")

    (listed,) = result["attestations"][0]["grants"]
    assert listed["revoked"] is True
