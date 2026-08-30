"""
The resume-check endpoint. Gemini is ALWAYS mocked -- no test performs a
network call, and none needs an API key.

The property under test is the split: the model extracts, the credential
decides. The endpoint must never present a partial or invented result as a
verdict.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

import pytest

from models.schemas import CredentialIndexItem, CredentialStatus
from routers import holder
from services import gemini_client

TOKEN = "tok-abc"


def _index_item() -> CredentialIndexItem:
    now = datetime.now(timezone.utc)
    return CredentialIndexItem(
        credential_id="cred-1",
        university_id="North Valley University",
        issuer_address="issuer-1",
        holder_token_hash=hashlib.sha256(TOKEN.encode()).hexdigest(),
        status=CredentialStatus.ISSUED,
        created_at=now,
        updated_at=now,
        credential_type="Master of Artificial Intelligence",
    )


@pytest.fixture
def stack(monkeypatch, tmp_path):
    monkeypatch.setenv("SHARE_GRANT_STORE_PATH", str(tmp_path / "grants.json"))

    def _install(*, status: str = "VALID", claims=None, extraction_error: Exception | None = None):
        async def _scan():
            return [_index_item()]

        async def _verify_proof(**_kwargs):
            disclosed = (
                {"institutionId": "a3f1", "degreeCode": 1, "graduationYear": 2026, "gpaTimes100": 390}
                if status == "VALID"
                else None
            )
            return {"chain": {"status": status, "disclosed": disclosed, "withheld": [], "evidence": {}, "proof": {}}}

        async def _extract(_text):
            if extraction_error:
                raise extraction_error
            return claims or []

        monkeypatch.setattr(holder.dynamo_client, "scan_credentials", _scan)
        monkeypatch.setattr(holder.chain_service_client, "verify_proof", _verify_proof)
        monkeypatch.setattr(holder.gemini_client, "extract_resume_claims", _extract)

    return _install


def _body(response) -> dict:
    return json.loads(response.body)


async def _check(text: str = "resume text", token: str = TOKEN):
    return await holder.check_resume(holder.ResumeCheckRequest(resumeText=text), token)


async def test_claims_are_labelled_against_the_proven_credential(stack):
    stack(
        claims=[
            {"type": "degree", "text": "MSc AI", "value": "Master of Artificial Intelligence"},
            {"type": "graduationYear", "text": "2026", "value": "2026"},
            {"type": "gpa", "text": "GPA 4.0", "value": "4.0"},
            {"type": "other", "text": "AWS certified", "value": "AWS certified"},
        ]
    )

    result = await _check()

    verdicts = [c["verdict"] for c in result["claims"]]
    assert verdicts == ["proven", "proven", "contradicted", "unproven"]
    assert result["summary"] == {"proven": 2, "unproven": 1, "contradicted": 1}
    assert "checkedAt" in result


async def test_an_inflated_gpa_is_caught_even_though_the_model_reported_it_plainly(stack):
    """The model is not the judge. It extracted '4.0' without comment; the
    credential is what turns that into 'contradicted'."""
    stack(claims=[{"type": "gpa", "text": "GPA: 4.0/4.0", "value": "4.0"}])

    result = await _check()

    assert result["claims"][0]["verdict"] == "contradicted"
    assert "3.90" in result["claims"][0]["reason"]


async def test_extraction_failure_returns_503_with_no_partial_results(stack):
    """A half-checked resume reads as a verdict. Better to say nothing."""
    stack(extraction_error=gemini_client.GeminiUnavailableError("boom"))

    response = await _check()

    assert response.status_code == 503
    body = _body(response)
    assert body["error"]["code"] == "AI_UNAVAILABLE"
    assert "claims" not in body
    assert "summary" not in body


async def test_a_missing_api_key_is_reported_as_unavailable_without_any_network_call(monkeypatch):
    """The real client, not a stub: it must refuse before building a request."""
    from core.config import Settings, get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("GEMINI_API_KEY", "")

    async def _explode(*_a, **_k):
        raise AssertionError("no HTTP request may be made without a key")

    monkeypatch.setattr(gemini_client.httpx, "AsyncClient", _explode)

    with pytest.raises(gemini_client.GeminiUnavailableError):
        await gemini_client.extract_resume_claims("anything")

    get_settings.cache_clear()


async def test_a_revoked_credential_cannot_back_any_claim(stack):
    stack(status="REVOKED", claims=[{"type": "gpa", "text": "3.9", "value": "3.9"}])

    response = await _check()

    assert response.status_code == 409
    assert _body(response)["error"]["code"] == "CREDENTIAL_ALREADY_REVOKED"


async def test_empty_resume_text_is_rejected_before_anything_else(stack):
    stack()

    response = await _check(text="   ")

    assert response.status_code == 400
    assert _body(response)["error"]["code"] == "VALIDATION_ERROR"


async def test_an_oversized_paste_is_rejected(stack):
    """Guards the model call from a hostile paste."""
    stack()

    response = await _check(text="x" * 20_001)

    assert response.status_code == 400
    assert _body(response)["error"]["code"] == "VALIDATION_ERROR"


async def test_resume_check_requires_the_holder_token(stack):
    stack()

    response = await _check(token=None)

    assert response.status_code == 401
