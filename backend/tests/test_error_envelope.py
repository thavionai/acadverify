"""Regression tests for a QA1 finding about error honesty.

docs/api-spec.md sets one rule above all others: INVALID_PROOF means the
CREDENTIAL failed; 5xx means WE failed. The backend violated it in the inverse
direction — every chain-service 4xx was re-rendered as an HTTP 502, telling a
verifier our infrastructure was broken when the real answer was "no such
credential".

It also emitted `error` as a bare STRING rather than the {code, message} object
docs/api-spec.md mandates. frontend/lib/api.ts only reads `error` when it is an
object, so the real code was discarded and every named chain-service error
(NOT_FOUND, ISSUER_NOT_AUTHORIZED, CREDENTIAL_ALREADY_REVOKED,
PROOF_MATERIAL_UNAVAILABLE) collapsed into a generic UNKNOWN_ERROR in the UI.

This was reachable in ordinary use, not a corner case: mock chain-service state
is in-memory, so any chain-service restart orphans previously-issued
credentials, and looking one up returned "502 service outage".
"""

from __future__ import annotations

import json

from core.error_handlers import (
    chain_service_request_error_handler,
    chain_service_unavailable_handler,
)
from services.chain_service_client import (
    ChainServiceRequestError,
    ChainServiceUnavailableError,
)


class _StubRequest:
    """Minimal stand-in — the handlers only read these for logging."""

    method = "GET"

    class url:  # noqa: N801 - mimicking starlette's request.url.path
        path = "/api/v1/verify/some-credential"


def _body(response) -> dict:
    return json.loads(response.body)


def _chain_envelope(code: str, message: str) -> str:
    """The body chain-service actually sends (see its http/app.ts)."""
    return json.dumps({"error": {"code": code, "message": message, "requestId": "abc-123"}})


async def test_chain_404_stays_404_and_keeps_its_code():
    """A missing credential is a client-side fact, not an outage."""
    exc = ChainServiceRequestError(404, _chain_envelope("NOT_FOUND", "Credential not found."))

    response = await chain_service_request_error_handler(_StubRequest(), exc)

    assert response.status_code == 404, "a 404 must not be reported as a 502 outage"
    assert _body(response)["error"]["code"] == "NOT_FOUND"


async def test_error_is_an_object_not_a_string():
    """frontend/lib/api.ts discards the payload unless `error` is an object."""
    exc = ChainServiceRequestError(409, _chain_envelope("CREDENTIAL_ALREADY_REVOKED", "Already revoked."))

    body = _body(await chain_service_request_error_handler(_StubRequest(), exc))

    assert isinstance(body["error"], dict), "error must be {code, message}, not a bare string"
    assert body["error"]["code"] == "CREDENTIAL_ALREADY_REVOKED"
    assert body["error"]["message"]


async def test_named_codes_survive_to_the_client():
    """Each named code must arrive intact rather than collapsing to UNKNOWN_ERROR."""
    for status_code, code in [
        (404, "NOT_FOUND"),
        (403, "ISSUER_NOT_AUTHORIZED"),
        (409, "DUPLICATE_CREDENTIAL"),
    ]:
        exc = ChainServiceRequestError(status_code, _chain_envelope(code, "message"))
        response = await chain_service_request_error_handler(_StubRequest(), exc)

        assert response.status_code == status_code
        assert _body(response)["error"]["code"] == code


async def test_chain_5xx_is_reported_as_our_failure():
    """A chain-service 5xx genuinely IS our infrastructure failing."""
    exc = ChainServiceRequestError(500, _chain_envelope("INTERNAL", "boom"))

    response = await chain_service_request_error_handler(_StubRequest(), exc)

    assert response.status_code == 503
    assert _body(response)["error"]["code"] == "CHAIN_UNAVAILABLE"


async def test_unparseable_upstream_body_still_preserves_status():
    """`detail` is truncated at the call site, so parsing can legitimately fail.

    Falling back to 502 would reintroduce the original bug — misattributing a
    client error to our infrastructure — so the upstream status is preserved.
    """
    exc = ChainServiceRequestError(404, "<html>gateway noise</html>")

    response = await chain_service_request_error_handler(_StubRequest(), exc)

    assert response.status_code == 404
    assert isinstance(_body(response)["error"], dict)


async def test_unreachable_chain_service_uses_the_spec_envelope():
    exc = ChainServiceUnavailableError("connection refused")

    response = await chain_service_unavailable_handler(_StubRequest(), exc)
    body = _body(response)

    assert response.status_code == 503
    assert body["error"]["code"] == "CHAIN_UNAVAILABLE"
    # Must never read as a verdict on the credential itself.
    assert "not a statement about the" in body["error"]["message"]
