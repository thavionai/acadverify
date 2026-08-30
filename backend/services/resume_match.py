"""
Decide which resume claims the credential actually proves.

This is the half of the resume checker that must never be delegated to a model.
Gemini reads prose and returns "here is a claim"; every verdict below is
reached by comparing that claim to values the circuit proved. A model that
invents a degree cannot cause one to be reported as proven, because the model's
output is only ever an input to these comparisons.

Pure and I/O-free on purpose — it is the piece worth unit-testing hardest.
"""

from __future__ import annotations

import re

PROVEN = "proven"
UNPROVEN = "unproven"
CONTRADICTED = "contradicted"

_YEAR = re.compile(r"\b(\d{4})\b")
_NUMBER = re.compile(r"\d+(?:\.\d+)?")


def _norm(value: str) -> str:
    return " ".join(str(value).casefold().split())


def _first_number(value: str) -> float | None:
    # "3.9/4.0" means a 3.9 on a 4-point scale — the claim is the first number.
    head = str(value).split("/")[0]
    match = _NUMBER.search(head)
    if not match:
        return None
    try:
        return float(match.group())
    except ValueError:
        return None


def _check_text(claim_value: str, proven_value: str, label: str) -> tuple[str, str]:
    if not proven_value:
        return UNPROVEN, f"this credential does not state {label}"

    claimed, actual = _norm(claim_value), _norm(proven_value)
    if not claimed:
        return UNPROVEN, "nothing to compare"
    if claimed in actual or actual in claimed:
        return PROVEN, f"matches the {label} on this credential"

    # NOT contradicted. A resume may list several qualifications; a different
    # school is simply not covered by THIS credential, and calling that a
    # contradiction would accuse an honest graduate of lying.
    return UNPROVEN, f"this credential is for {proven_value}, so it cannot vouch for that {label}"


def _check_year(claim_value: str, proven_year: int | None) -> tuple[str, str]:
    if proven_year is None:
        return UNPROVEN, "this credential does not disclose a graduation year"

    match = _YEAR.search(str(claim_value))
    if not match:
        return UNPROVEN, "no four-digit year found in this claim"

    claimed = int(match.group(1))
    if claimed == proven_year:
        return PROVEN, "matches the proven graduation year"
    return CONTRADICTED, f"the proven graduation year is {proven_year}"


def _check_gpa(claim_value: str, proven_gpa: float | None) -> tuple[str, str]:
    if proven_gpa is None:
        # Either the holder never consented to see it, or the proof failed.
        return UNPROVEN, "this credential does not disclose a GPA"

    claimed = _first_number(claim_value)
    if claimed is None:
        return UNPROVEN, "no numeric GPA found in this claim"

    # Tolerance, not equality: 3.9 and 3.90 are the same claim, and the
    # credential stores hundredths.
    if abs(claimed - proven_gpa) <= 0.01:
        return PROVEN, f"matches the proven GPA of {proven_gpa:.2f}"
    return CONTRADICTED, f"the proven GPA is {proven_gpa:.2f}"


def match_claims(claims: list[dict], proven: dict) -> list[dict]:
    """Label each extracted claim against the proven credential.

    `proven` carries institution, degree, graduationYear and gpa — whatever the
    circuit actually disclosed. Unknown claim types fall through to `unproven`
    rather than raising, so a model returning something unexpected degrades to
    "we cannot vouch for this" instead of breaking the page.
    """
    out: list[dict] = []

    for claim in claims or []:
        claim_type = str(claim.get("type") or "other")
        value = str(claim.get("value") or "")
        text = str(claim.get("text") or "")

        if claim_type == "institution":
            verdict, reason = _check_text(value, proven.get("institution") or "", "institution")
        elif claim_type == "degree":
            verdict, reason = _check_text(value, proven.get("degree") or "", "degree")
        elif claim_type == "graduationYear":
            verdict, reason = _check_year(value, proven.get("graduationYear"))
        elif claim_type == "gpa":
            verdict, reason = _check_gpa(value, proven.get("gpa"))
        else:
            claim_type = "other"
            verdict, reason = UNPROVEN, "this credential says nothing about that"

        out.append({"type": claim_type, "text": text, "value": value, "verdict": verdict, "reason": reason})

    return out
