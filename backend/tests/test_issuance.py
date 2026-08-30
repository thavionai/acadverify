"""
Issuance: the access link, the email that carries it, and the attestations
that hang off it.

The recurring theme is that the credential is already on-chain by the time
most of this code runs, so almost nothing here is allowed to fail the request.
"""
from __future__ import annotations

import json

import pytest

from routers import portal
from services import chain_service_client


def _request(**overrides) -> portal.PortalIssueRequest:
    base = dict(
        studentName="Ada Lovelace",
        studentId="S-1",
        degree="BSc Computer Science",
        institution="North Valley University",
        major="CS",
        graduationDate="2026-06-15",
        honors="",
        gpa="3.90",
    )
    base.update(overrides)
    return portal.PortalIssueRequest(**base)


@pytest.fixture
def stack(monkeypatch):
    """
    A full issuance with every outbound call replaced. Returns the recorder so
    a test can inspect exactly what would have hit the chain, the index, and
    the mail server.
    """
    recorder = {"chain": [], "rows": [], "email": [], "emails_sent": True}

    async def _issue_credential(**kwargs):
        recorder["chain"].append(kwargs)
        behaviour = recorder.get("chain_behaviour")
        if behaviour:
            behaviour(len(recorder["chain"]) - 1, kwargs)
        return {
            "status": "issued",
            "chain_proof_ref": f"0xtx{len(recorder['chain'])}",
            "chain": {"commitment": "0xcommit"},
        }

    def _qr(credential_id):
        return (f"http://localhost:3000/verify/{credential_id}", b"png-bytes")

    async def _upload(credential_id, png):
        return (f"qr/{credential_id}.png", f"http://minio/qr/{credential_id}.png")

    async def _put(item):
        if recorder.get("row_behaviour"):
            recorder["row_behaviour"](item)
        recorder["rows"].append(item)

    async def _send(to_email, hold_url, institution, degree):
        recorder["email"].append(
            {"to": to_email, "holdUrl": hold_url, "institution": institution, "degree": degree}
        )
        return recorder["emails_sent"]

    monkeypatch.setattr(portal.chain_service_client, "issue_credential", _issue_credential)
    monkeypatch.setattr(portal, "generate_qr_for_credential", _qr)
    monkeypatch.setattr(portal.s3_client, "upload_qr_code", _upload)
    monkeypatch.setattr(portal.dynamo_client, "put_credential_index", _put)
    monkeypatch.setattr(portal.mailer, "send_holder_link", _send)
    return recorder


# --------------------------------------------------------------------------
# The email
# --------------------------------------------------------------------------

async def test_no_address_means_the_mailer_is_never_called(stack):
    result = await portal.issue_credential_portal(_request(), issuer="mn_issuer")

    assert result["emailSent"] is None, "null distinguishes 'not asked' from 'failed'"
    assert stack["email"] == []
    assert result["holdUrl"].startswith("http")


async def test_the_student_is_emailed_their_own_link(stack):
    result = await portal.issue_credential_portal(
        _request(studentEmail="grad@example.edu"), issuer="mn_issuer"
    )

    assert result["emailSent"] is True
    (sent,) = stack["email"]
    assert sent["to"] == "grad@example.edu"
    assert sent["holdUrl"] == result["holdUrl"], "the link mailed must be the link minted"
    assert sent["institution"] == "North Valley University"


async def test_a_whitespace_address_is_not_an_address(stack):
    result = await portal.issue_credential_portal(
        _request(studentEmail="   "), issuer="mn_issuer"
    )

    assert result["emailSent"] is None
    assert stack["email"] == []


async def test_a_failed_send_still_returns_the_link(stack):
    """
    The credential is on-chain and the token is unreconstructable. Losing the
    response over a bounced email would strand it permanently.
    """
    stack["emails_sent"] = False

    result = await portal.issue_credential_portal(
        _request(studentEmail="typo@@example.edu"), issuer="mn_issuer"
    )

    assert result["emailSent"] is False
    assert result["holdUrl"], "the only copy of the token"
    assert result["id"]


async def test_the_address_is_never_written_to_the_index(stack):
    """The server's claim is that it stores no student identity."""
    address = "graduate-private@example.edu"

    await portal.issue_credential_portal(
        _request(studentEmail=address), issuer="mn_issuer"
    )

    for row in stack["rows"]:
        assert address not in json.dumps(row.model_dump(mode="json"))
        assert "graduate-private" not in json.dumps(row.model_dump(mode="json"))


async def test_the_token_is_stored_only_as_a_digest(stack):
    result = await portal.issue_credential_portal(
        _request(studentEmail="grad@example.edu"), issuer="mn_issuer"
    )

    token = result["holdUrl"].rsplit("/hold/", 1)[1]
    (row,) = stack["rows"]
    assert token not in json.dumps(row.model_dump(mode="json"))
    assert row.holder_token_hash and len(row.holder_token_hash) == 64


# --------------------------------------------------------------------------
# Attestations
# --------------------------------------------------------------------------

async def test_each_attestation_becomes_its_own_credential(stack):
    result = await portal.issue_credential_portal(
        _request(
            attestations=[
                {"kind": "course", "title": "Algorithms", "grade": "3.8", "year": "2025"},
                {"kind": "honor", "title": "Deans List", "year": "2024"},
            ]
        ),
        issuer="mn_issuer",
    )

    assert len(stack["chain"]) == 3, "one degree plus two attestations"
    assert len(stack["rows"]) == 3

    ids = [call["credential_id"] for call in stack["chain"]]
    assert len(set(ids)) == 3, "each attestation is its own credential"

    salts = [call["witness"]["salt"] for call in stack["chain"]]
    assert len(set(salts)) == 3, "a reused salt would link the commitments"

    # One access link opens all of them.
    hashes = {row.holder_token_hash for row in stack["rows"]}
    assert len(hashes) == 1

    assert [a["ok"] for a in result["attestations"]] == [True, True]
    assert [a["title"] for a in result["attestations"]] == ["Algorithms", "Deans List"]


async def test_the_degree_row_is_written_first(stack):
    """
    /hold/me picks the primary by looking for the row with no attestation
    kind. A bundle whose degree row failed to write would have no primary.
    """
    await portal.issue_credential_portal(
        _request(attestations=[{"kind": "course", "title": "Algorithms"}]),
        issuer="mn_issuer",
    )

    assert stack["rows"][0].attestation_kind is None
    assert stack["rows"][1].attestation_kind == "course"
    assert stack["rows"][1].credential_type == "Course · Algorithms"


async def test_attestation_rows_carry_no_qr(stack):
    """The certificate renderer regenerates the QR, so storing one is waste."""
    await portal.issue_credential_portal(
        _request(attestations=[{"kind": "course", "title": "Algorithms"}]),
        issuer="mn_issuer",
    )

    row = stack["rows"][1]
    assert row.qr_code_s3_key is None
    assert row.qr_code_public_url is None


@pytest.mark.parametrize(
    "grade,expected",
    [
        ("3.8", 3.8),
        ("", None),
        ("A", None),          # letter grades ride in the title instead
        ("999", None),        # beyond the chain's uint16 gpaTimes100
        ("-1", None),
        ("  3.5  ", 3.5),
    ],
)
async def test_grades_outside_what_the_chain_can_hold_become_absent(stack, grade, expected):
    await portal.issue_credential_portal(
        _request(attestations=[{"kind": "course", "title": "Algorithms", "grade": grade}]),
        issuer="mn_issuer",
    )

    assert stack["chain"][1]["witness"]["gpa"] == expected


async def test_the_attestation_year_falls_back_to_the_degree_year(stack):
    await portal.issue_credential_portal(
        _request(
            attestations=[
                {"kind": "course", "title": "Own year", "year": "2024"},
                {"kind": "course", "title": "No year"},
            ]
        ),
        issuer="mn_issuer",
    )

    assert stack["chain"][1]["witness"]["graduation_date"] == "2024"
    assert stack["chain"][2]["witness"]["graduation_date"] == "2026-06-15"


async def test_one_rejected_attestation_does_not_stop_the_others(stack):
    def behaviour(index, kwargs):
        if index == 2:
            raise chain_service_client.ChainServiceRequestError(400, "rejected")

    stack["chain_behaviour"] = behaviour

    result = await portal.issue_credential_portal(
        _request(
            attestations=[
                {"kind": "course", "title": "First"},
                {"kind": "course", "title": "Rejected"},
                {"kind": "course", "title": "Third"},
            ]
        ),
        issuer="mn_issuer",
    )

    assert [a["ok"] for a in result["attestations"]] == [True, False, True]
    assert result["holdUrl"], "the degree was issued; the response must survive"
    assert len(stack["rows"]) == 3, "the failed attestation writes no index row"


async def test_a_chain_outage_abandons_the_rest_of_the_batch(stack):
    """Each retry would burn the full chain timeout for a doomed call."""

    def behaviour(index, kwargs):
        if index >= 1:
            raise chain_service_client.ChainServiceUnavailableError("chain is down")

    stack["chain_behaviour"] = behaviour

    result = await portal.issue_credential_portal(
        _request(
            attestations=[
                {"kind": "course", "title": "First"},
                {"kind": "course", "title": "Second"},
                {"kind": "course", "title": "Third"},
            ]
        ),
        issuer="mn_issuer",
    )

    assert [a["ok"] for a in result["attestations"]] == [False, False, False]
    assert len(stack["chain"]) == 2, "it stopped rather than retrying into the outage"
    assert result["id"], "the degree still issued"


async def test_an_attestation_index_failure_is_reported_not_raised(stack):
    from services import dynamo_client

    def behaviour(item):
        if item.attestation_kind == "course":
            raise dynamo_client.DynamoClientError("table gone")

    stack["row_behaviour"] = behaviour

    result = await portal.issue_credential_portal(
        _request(attestations=[{"kind": "course", "title": "Algorithms"}]),
        issuer="mn_issuer",
    )

    assert result["attestations"][0]["ok"] is False
    assert result["holdUrl"]


async def test_an_unknown_kind_is_rejected_before_anything_is_issued(stack):
    response = await portal.issue_credential_portal(
        _request(attestations=[{"kind": "vibes", "title": "Good ones"}]),
        issuer="mn_issuer",
    )

    assert response.status_code == 400
    assert json.loads(response.body)["error"]["code"] == "VALIDATION_ERROR"
    assert stack["chain"] == [], "nothing may reach the chain"


async def test_too_many_attestations_are_rejected_before_anything_is_issued(stack):
    response = await portal.issue_credential_portal(
        _request(
            attestations=[{"kind": "course", "title": f"Course {i}"} for i in range(11)]
        ),
        issuer="mn_issuer",
    )

    assert response.status_code == 400
    assert stack["chain"] == []


async def test_untitled_attestation_rows_are_dropped_silently(stack):
    """The form submits blank repeater rows; they are not an error."""
    result = await portal.issue_credential_portal(
        _request(
            attestations=[
                {"kind": "course", "title": "Real"},
                {"kind": "course", "title": "   "},
                {"kind": "course", "title": ""},
            ]
        ),
        issuer="mn_issuer",
    )

    assert len(result["attestations"]) == 1
    assert len(stack["chain"]) == 2


async def test_a_degree_only_issuance_reports_no_attestations(stack):
    result = await portal.issue_credential_portal(_request(), issuer="mn_issuer")

    assert result["attestations"] == []
    assert len(stack["chain"]) == 1
