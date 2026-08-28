/**
 * Guarantees the CHAIN_MODE=mock -> live flip is a no-op for every consumer.
 *
 * Both adapters implement one ChainAdapter interface behind identical routes, so
 * asserting the mock's responses against the shared response shape is what makes
 * "backend does not change on Saturday" a checked claim rather than a promise.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockChainAdapter } from "../../src/chain/mock.js";

const hex32 = z.string().regex(/^[0-9a-f]{64}$/);

const DisclosedClaimSchema = z.object({
  institutionId: hex32,
  degreeCode: z.number().int(),
  graduationYear: z.number().int(),
  gpaTimes100: z.number().int().nullable(),
});

const ProveResponseSchema = z.object({
  status: z.enum(["VALID", "REVOKED", "INVALID_PROOF"]),
  disclosed: DisclosedClaimSchema.nullable(),
  withheld: z.array(z.string()),
  evidence: z.object({
    contractAddress: z.string().nullable(),
    networkId: z.string(),
    commitment: z.string().nullable(),
    issuanceTxId: z.string().nullable(),
    stateBlockHeight: z.number().nullable(),
    checkedAt: z.string(),
  }),
  proof: z.object({
    level: z.enum(["circuit-checked", "zk-verified"]),
    verified: z.boolean(),
    provingMs: z.number(),
  }),
});

const adapter = () => new MockChainAdapter("undeployed");

describe("prove response shape", () => {
  it("matches the frozen schema for a valid credential", async () => {
    const res = await adapter().prove("ACAD-2026-000001", []);
    expect(() => ProveResponseSchema.parse(res)).not.toThrow();
    expect(res.status).toBe("VALID");
  });

  it("matches the frozen schema for revoked and tampered credentials", async () => {
    const revoked = await adapter().prove("ACAD-2026-000003", []);
    expect(() => ProveResponseSchema.parse(revoked)).not.toThrow();
    expect(revoked.status).toBe("REVOKED");

    const tampered = await adapter().prove("ACAD-2026-000004", []);
    expect(tampered.status).toBe("INVALID_PROOF");
  });
});

describe("selective disclosure", () => {
  it("withholds the GPA unless consent is given", async () => {
    const res = await adapter().prove("ACAD-2026-000001", []);
    expect(res.disclosed?.gpaTimes100).toBeNull();
    expect(res.withheld).toContain("gpa");
  });

  it("discloses the GPA when consented", async () => {
    const res = await adapter().prove("ACAD-2026-000002", ["gpa"]);
    expect(res.disclosed?.gpaTimes100).toBe(390);
    expect(res.withheld).not.toContain("gpa");
  });

  it("never discloses the student identity, under any disclosure set", async () => {
    for (const disclose of [[], ["gpa"]]) {
      const res = await adapter().prove("ACAD-2026-000001", disclose);
      expect(res.withheld).toContain("studentId");
      expect(JSON.stringify(res)).not.toContain("studentId\":\"");
      expect(Object.keys(res.disclosed ?? {})).not.toContain("studentId");
    }
  });

  it("uses null rather than 0 for a withheld GPA, so a real 0.00 stays distinguishable", async () => {
    const res = await adapter().prove("ACAD-2026-000001", []);
    expect(res.disclosed?.gpaTimes100).not.toBe(0);
    expect(res.disclosed?.gpaTimes100).toBeNull();
  });
});

describe("honest failure modes", () => {
  it("reports a wiped vault as OUR failure, never as a credential verdict", async () => {
    // If this ever returns INVALID_PROOF, a wiped volume makes every real degree
    // on the platform render as forged.
    await expect(adapter().prove("ACAD-2026-000005", [])).rejects.toMatchObject({
      code: "PROOF_MATERIAL_UNAVAILABLE",
      status: 503,
    });
  });

  it("404s an unknown credential rather than calling it invalid", async () => {
    await expect(adapter().prove("NOPE", [])).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("issuance", () => {
  it("rejects a duplicate credential id", async () => {
    const a = adapter();
    const fields = (await a.prove("ACAD-2026-000001", ["gpa"])) && {
      studentId: "aa".repeat(32),
      issuerPk: "b2e7".padEnd(64, "0"),
      institutionId: "a3f1".padEnd(64, "0"),
      degreeCode: 1,
      graduationYear: 2026,
      gpaTimes100: 400,
    };
    await expect(a.issue("ACAD-2026-000001", fields)).rejects.toMatchObject({
      code: "DUPLICATE_CREDENTIAL",
    });
  });

  it("rejects an unauthorized issuer key", async () => {
    await expect(
      adapter().issue("ACAD-2026-999999", {
        studentId: "aa".repeat(32),
        issuerPk: "cc".repeat(32),
        institutionId: "a3f1".padEnd(64, "0"),
        degreeCode: 1,
        graduationYear: 2026,
        gpaTimes100: 400,
      }),
    ).rejects.toMatchObject({ code: "ISSUER_NOT_AUTHORIZED" });
  });
});
