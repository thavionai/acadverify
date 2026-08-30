"""
The certificate PDF.

Its defining property is an absence: there is no student name on it, and no
parameter through which one could be supplied. That is not a stylistic choice —
the index never stored the name, so by the time a certificate is requested the
name does not exist anywhere on the server.
"""

from __future__ import annotations

import inspect
import json
from datetime import datetime, timezone

import pytest

from models.schemas import CredentialIndexItem, CredentialStatus
from routers import portal
from services.certificate import render_certificate_pdf

ISSUER = "mn_shield-addr1_issuer"


def _index_item(issuer: str = ISSUER) -> CredentialIndexItem:
    now = datetime.now(timezone.utc)
    return CredentialIndexItem(
        credential_id="cred-1",
        university_id="North Valley University",
        issuer_address=issuer,
        status=CredentialStatus.ISSUED,
        created_at=now,
        updated_at=now,
        credential_type="Master of Artificial Intelligence",
        graduation_year=2026,
    )


async def test_renders_a_real_pdf():
    pdf = render_certificate_pdf(
        credential_id="cred-1",
        degree="Master of Artificial Intelligence",
        institution="North Valley University",
        graduation_year=2026,
        verify_url="http://localhost:3000/verify/cred-1",
    )

    assert pdf.startswith(b"%PDF-")
    assert len(pdf) > 1000, "a PDF this small has not rendered anything"


async def test_renders_without_a_graduation_year():
    """graduation_year is optional on the index, so it must be optional here."""
    pdf = render_certificate_pdf(
        credential_id="cred-1",
        degree="BSc",
        institution="Somewhere",
        graduation_year=None,
        verify_url="http://localhost:3000/verify/cred-1",
    )

    assert pdf.startswith(b"%PDF-")


async def test_there_is_no_way_to_put_a_name_on_it():
    """A code-shape guarantee. If someone later adds a name parameter, this
    fails and they have to justify where the name came from — the index does
    not store one."""
    params = set(inspect.signature(render_certificate_pdf).parameters)

    assert params == {"credential_id", "degree", "institution", "graduation_year", "verify_url"}
    assert not any("name" in p and p != "institution" for p in params)


async def test_endpoint_returns_a_pdf_attachment(monkeypatch):
    async def _get_index(_credential_id):
        return _index_item()

    monkeypatch.setattr(portal.dynamo_client, "get_credential_index", _get_index)

    response = await portal.download_certificate("cred-1", ISSUER)

    assert response.media_type == "application/pdf"
    assert response.body.startswith(b"%PDF-")
    assert "attachment" in response.headers["content-disposition"]
    assert "cred-1-certificate.pdf" in response.headers["content-disposition"]


async def test_another_issuers_credential_reads_as_absent(monkeypatch):
    """Not '403 forbidden' — absent. A different answer for 'exists but not
    yours' would let one university enumerate another's credential ids."""
    async def _get_index(_credential_id):
        return _index_item(issuer="someone-else")

    async def _missing(_credential_id):
        return None

    monkeypatch.setattr(portal.dynamo_client, "get_credential_index", _get_index)
    theirs = await portal.download_certificate("cred-1", ISSUER)

    monkeypatch.setattr(portal.dynamo_client, "get_credential_index", _missing)
    absent = await portal.download_certificate("cred-1", ISSUER)

    assert theirs.status_code == absent.status_code == 404
    assert json.loads(theirs.body)["error"]["code"] == "NOT_FOUND"
