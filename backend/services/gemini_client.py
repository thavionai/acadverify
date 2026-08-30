"""
Resume claim extraction via Gemini.

The model's job is deliberately small: read prose, return the education claims
it finds, quote them exactly, and normalise the values. It does not decide
whether a claim is true — services/resume_match.py does that by comparing
against what the circuit actually proved. Keeping the model on the extraction
side of that line is what makes a hallucinated degree harmless.

Privacy notes:
  - the key travels in the x-goog-api-key HEADER, never a query string, so it
    cannot land in a proxy or access log;
  - resume text is passed straight through and never logged here.
"""

from __future__ import annotations

import json
import logging

import httpx

from core.config import get_settings

logger = logging.getLogger(__name__)

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Every field the matcher understands. `other` is the escape hatch: an
# education claim we have no way to check, which is honest rather than silent.
_RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "type": {"type": "STRING", "enum": ["degree", "institution", "graduationYear", "gpa", "other"]},
            "text": {"type": "STRING"},
            "value": {"type": "STRING"},
        },
        "required": ["type", "text", "value"],
    },
}

_PROMPT = """You extract education claims from resume text.

Return every distinct claim the text makes about: a degree earned, an
institution attended, a graduation year, or a GPA.

For each claim:
  text  - the exact quote from the resume, copied verbatim
  value - the normalized value: a 4-digit year; a GPA as a decimal like 3.90;
          a degree or institution as its literal name
  type  - one of degree, institution, graduationYear, gpa, other

Use "other" for an education claim that fits none of those categories.

Extract only. Do NOT judge, verify, rank, or invent claims, and do not infer
anything the text does not say. If the text makes no education claims, return
an empty array."""

_MAX_FIELD_CHARS = 500


class GeminiUnavailableError(Exception):
    """Extraction could not be completed.

    Covers a missing key, a timeout, a non-2xx, and unparseable output alike:
    the caller reports all of them as one honest "unavailable" rather than
    showing partial or invented results.
    """


async def extract_resume_claims(resume_text: str) -> list[dict]:
    settings = get_settings()
    api_key = (settings.gemini_api_key or "").strip()
    if not api_key:
        raise GeminiUnavailableError("GEMINI_API_KEY is not configured")

    url = _ENDPOINT.format(model=settings.gemini_model)
    body = {
        "contents": [{"parts": [{"text": f"{_PROMPT}\n\nRESUME TEXT:\n{resume_text}"}]}],
        "generationConfig": {
            # Deterministic: the same resume should extract the same claims.
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": _RESPONSE_SCHEMA,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=settings.gemini_timeout_seconds) as client:
            response = await client.post(
                url,
                json=body,
                headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise GeminiUnavailableError(f"request failed: {exc}") from exc

    if response.status_code >= 400:
        # Status only — the body can echo the prompt, and the prompt is a resume.
        raise GeminiUnavailableError(f"gemini returned {response.status_code}")

    try:
        payload = response.json()
        raw = payload["candidates"][0]["content"]["parts"][0]["text"]
        claims = json.loads(raw)
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise GeminiUnavailableError(f"unparseable response: {exc}") from exc

    if not isinstance(claims, list):
        raise GeminiUnavailableError("expected a list of claims")

    # Clamp before anything downstream renders it: responseSchema constrains
    # the shape, not the length, and this text reaches a browser.
    cleaned: list[dict] = []
    for claim in claims:
        if not isinstance(claim, dict):
            continue
        cleaned.append(
            {
                "type": str(claim.get("type") or "other")[:32],
                "text": str(claim.get("text") or "")[:_MAX_FIELD_CHARS],
                "value": str(claim.get("value") or "")[:_MAX_FIELD_CHARS],
            }
        )

    return cleaned
