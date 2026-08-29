/**
 * Regression test for a QA1 finding: `withheld` was derived from CONSENT alone,
 * independent of whether the proof actually succeeded.
 *
 * On a REVOKED (or INVALID_PROOF) credential nothing is disclosed at all —
 * `disclosed` is null — yet `withheld` still reported only ["studentId"]. A
 * holder who HAD consented to GPA therefore left gpa in neither list: null in
 * `disclosed`, absent from `withheld`.
 *
 * "What was withheld" is the core privacy claim this product shows a verifier,
 * so a field silently belonging to neither side undermines it. The invariant
 * pinned here: every disclosable field appears in exactly one of `disclosed`
 * (with a real value) or `withheld` — mutually exclusive, jointly exhaustive.
 */
import { describe, expect, it } from "vitest";
import { MockChainAdapter } from "../../src/chain/mock.js";

const DISCLOSABLE = ["studentId", "gpa", "institutionId", "degreeCode", "graduationYear"] as const;

const adapter = () => new MockChainAdapter("undeployed");

/** Field names the response actually disclosed (non-null values only). */
function disclosedKeys(disclosed: Record<string, unknown> | null): string[] {
  if (!disclosed) return [];
  return Object.entries(disclosed)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k]) => (k === "gpaTimes100" ? "gpa" : k));
}

describe("disclosed/withheld invariant", () => {
  it.each([
    ["VALID, no consent", "ACAD-2026-000001", [] as string[]],
    ["VALID, GPA consented", "ACAD-2026-000002", ["gpa"]],
    ["REVOKED, no consent", "ACAD-2026-000003", [] as string[]],
    // The exact case that regressed: revoked AND the holder consented to GPA.
    ["REVOKED, GPA consented", "ACAD-2026-000003", ["gpa"]],
    ["INVALID_PROOF, no consent", "ACAD-2026-000004", [] as string[]],
    ["INVALID_PROOF, GPA consented", "ACAD-2026-000004", ["gpa"]],
  ])("leaves no field unaccounted for (%s)", async (_label, credentialId, disclose) => {
    const res = await adapter().prove(credentialId, disclose);

    const shown = new Set(disclosedKeys(res.disclosed as Record<string, unknown> | null));
    const hidden = new Set(res.withheld);

    for (const field of DISCLOSABLE) {
      const inNeither = !shown.has(field) && !hidden.has(field);
      expect(inNeither, `"${field}" is in neither disclosed nor withheld`).toBe(false);

      const inBoth = shown.has(field) && hidden.has(field);
      expect(inBoth, `"${field}" is in both disclosed and withheld`).toBe(false);
    }
  });

  it("reports everything as withheld when the proof did not succeed", async () => {
    for (const credentialId of ["ACAD-2026-000003", "ACAD-2026-000004"]) {
      // Consent to GPA — before the fix this REMOVED gpa from `withheld` even
      // though a failed proof discloses nothing.
      const res = await adapter().prove(credentialId, ["gpa"]);

      expect(res.disclosed).toBeNull();
      for (const field of DISCLOSABLE) {
        expect(res.withheld, `${credentialId} should withhold ${field}`).toContain(field);
      }
    }
  });

  it("still withholds only the consented-away fields on a successful proof", async () => {
    // The fix must not over-report: a VALID proof genuinely does disclose.
    const withGpa = await adapter().prove("ACAD-2026-000002", ["gpa"]);
    expect(withGpa.withheld).toEqual(["studentId"]);
    expect(withGpa.disclosed).not.toBeNull();

    const withoutGpa = await adapter().prove("ACAD-2026-000001", []);
    expect(withoutGpa.withheld).toContain("gpa");
    expect(withoutGpa.withheld).toContain("studentId");
    expect(withoutGpa.withheld).not.toContain("degreeCode");
  });
});
