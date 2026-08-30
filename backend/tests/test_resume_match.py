"""
The half of the resume checker that must never be delegated to a model.

Gemini says "here is a claim"; these rules decide whether the credential
proves it. A hallucinated degree has to come out `unproven`, not `proven`.
"""

from __future__ import annotations

import pytest

from services.resume_match import CONTRADICTED, PROVEN, UNPROVEN, match_claims

PROVEN_CREDENTIAL = {
    "institution": "North Valley University",
    "degree": "Master of Artificial Intelligence",
    "graduationYear": 2026,
    "gpa": 3.90,
}


def _one(claim_type: str, value: str, proven: dict | None = None) -> dict:
    claims = [{"type": claim_type, "text": f"quote: {value}", "value": value}]
    return match_claims(claims, proven if proven is not None else PROVEN_CREDENTIAL)[0]


# --- graduation year -------------------------------------------------------

async def test_matching_year_is_proven():
    assert _one("graduationYear", "2026")["verdict"] == PROVEN


async def test_a_different_year_is_contradicted():
    """Unlike institution, a year is single-valued on this credential, so a
    different one genuinely conflicts."""
    result = _one("graduationYear", "2019")
    assert result["verdict"] == CONTRADICTED
    assert "2026" in result["reason"]


async def test_a_year_inside_a_sentence_is_still_found():
    assert _one("graduationYear", "Graduated in 2026 with honours")["verdict"] == PROVEN


async def test_an_unparseable_year_is_unproven_not_contradicted():
    assert _one("graduationYear", "last spring")["verdict"] == UNPROVEN


async def test_a_year_is_unproven_when_the_credential_does_not_disclose_one():
    proven = {**PROVEN_CREDENTIAL, "graduationYear": None}
    assert _one("graduationYear", "2026", proven)["verdict"] == UNPROVEN


# --- gpa -------------------------------------------------------------------

async def test_gpa_within_a_hundredth_is_proven():
    """3.9 and 3.90 are the same claim written two ways."""
    assert _one("gpa", "3.9")["verdict"] == PROVEN


async def test_gpa_out_of_four_format_parses():
    assert _one("gpa", "3.90/4.0")["verdict"] == PROVEN


async def test_an_inflated_gpa_is_contradicted():
    result = _one("gpa", "4.0")
    assert result["verdict"] == CONTRADICTED
    assert "3.90" in result["reason"]


async def test_a_lower_gpa_is_also_contradicted():
    assert _one("gpa", "3.10")["verdict"] == CONTRADICTED


async def test_gpa_is_unproven_when_it_was_not_disclosed():
    """Without consent the holder's own GPA is absent, and absence is not a
    licence to call the claim false."""
    proven = {**PROVEN_CREDENTIAL, "gpa": None}
    assert _one("gpa", "3.90", proven)["verdict"] == UNPROVEN


async def test_an_unparseable_gpa_is_unproven():
    assert _one("gpa", "excellent")["verdict"] == UNPROVEN


# --- institution and degree ------------------------------------------------

async def test_institution_matches_case_and_whitespace_insensitively():
    assert _one("institution", "  north   valley UNIVERSITY ")["verdict"] == PROVEN


async def test_institution_named_inside_a_longer_phrase_is_proven():
    assert _one("institution", "North Valley University, Dept. of CS")["verdict"] == PROVEN


async def test_a_different_school_is_unproven_not_contradicted():
    """A graduate may hold several qualifications. This credential simply
    cannot vouch for the others -- calling that a contradiction would accuse
    an honest person of lying."""
    result = _one("institution", "Riverside Institute of Technology")
    assert result["verdict"] == UNPROVEN
    assert "cannot vouch" in result["reason"]


async def test_degree_substring_is_proven():
    assert _one("degree", "Master of Artificial Intelligence")["verdict"] == PROVEN


async def test_a_different_degree_is_unproven():
    assert _one("degree", "Bachelor of Laws")["verdict"] == UNPROVEN


# --- shape and robustness --------------------------------------------------

async def test_other_claims_are_always_unproven():
    result = _one("other", "AWS Certified Solutions Architect")
    assert result["verdict"] == UNPROVEN
    assert result["type"] == "other"


async def test_an_unknown_claim_type_degrades_to_other_instead_of_raising():
    """A model returning something off-schema must not break the page."""
    result = match_claims([{"type": "wingspan", "text": "t", "value": "v"}], PROVEN_CREDENTIAL)[0]
    assert result["type"] == "other"
    assert result["verdict"] == UNPROVEN


async def test_empty_and_malformed_input_is_handled():
    assert match_claims([], PROVEN_CREDENTIAL) == []
    assert match_claims(None, PROVEN_CREDENTIAL) == []
    assert match_claims([{}], PROVEN_CREDENTIAL)[0]["verdict"] == UNPROVEN


async def test_every_result_carries_a_human_reason():
    claims = [
        {"type": "gpa", "text": "GPA 4.0", "value": "4.0"},
        {"type": "institution", "text": "NVU", "value": "North Valley University"},
    ]
    for result in match_claims(claims, PROVEN_CREDENTIAL):
        assert result["reason"], "a verdict with no explanation is not actionable"
