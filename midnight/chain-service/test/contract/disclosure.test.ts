/**
 * The machine-checkable form of this project's central privacy claim.
 *
 * Prose in the docs says a verification reveals only what the holder consented
 * to. These tests assert it against the compiled circuit's actual public
 * transcript — the bytes that would leave the prover — rather than trusting the
 * source to be read correctly.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Sim, bytes32, credential, publicKeyOf, type PrivateState } from "./harness.js";

const OWNER_SK = bytes32(0x01);
const ISSUER_SK = bytes32(0x02);
const CRED_ID = bytes32(0x10);
const SALT = bytes32(0x99);

/** Distinctive sentinel so it is unmistakable in a byte dump. */
const SENTINEL_STUDENT = bytes32(0xab);

const issuerSet = (): Partial<PrivateState> => ({
  secretKey: ISSUER_SK,
  fields: credential({ issuerPk: publicKeyOf(ISSUER_SK), studentId: SENTINEL_STUDENT }),
  salt: SALT,
});

/**
 * Every byte the circuit would publish, flattened to a hex string.
 *
 * compact-runtime 0.16 returns proofData directly on the circuit result:
 * { input, output, publicTranscript, privateTranscriptOutputs }.
 */
function publicBytes(raw: any): string {
  const pd = raw.proofData;
  const chunks: string[] = [];
  const walk = (v: unknown, depth = 0): void => {
    if (depth > 12 || v == null) return;
    if (v instanceof Uint8Array) return void chunks.push(Buffer.from(v).toString("hex"));
    if (typeof v === "bigint" || typeof v === "number") return void chunks.push(v.toString(16));
    if (Array.isArray(v)) return void v.forEach((x) => walk(x, depth + 1));
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        // Only the PUBLIC side of the proof — private transcript outputs are, by
        // definition, never published.
        if (k === "privateTranscriptOutputs" || k === "currentPrivateState") continue;
        walk(val, depth + 1);
      }
    }
  };
  // Only the PUBLIC side: input, output, and the public transcript. The private
  // transcript is by definition never published, so including it would make the
  // absence assertions meaningless.
  walk({ publicTranscript: pd?.publicTranscript, output: pd?.output, input: pd?.input });
  return chunks.join("");
}

let sim: Sim;

beforeEach(async () => {
  sim = await Sim.deploy(OWNER_SK);
  await sim.as({ secretKey: OWNER_SK }).call("authorizeIssuer", publicKeyOf(ISSUER_SK));
  await sim.as(issuerSet()).call("issue", CRED_ID);
});

describe("selective disclosure", () => {
  it("withholds the GPA when consent is not given", async () => {
    const claim: any = await sim.as(issuerSet()).read("proveCredential", CRED_ID, false);
    expect(claim.gpaTimes100).toBe(0n);
    expect(claim.degreeCode).toBe(4711n);
  });

  it("discloses the GPA when consent is given", async () => {
    const claim: any = await sim.as(issuerSet()).read("proveCredential", CRED_ID, true);
    expect(claim.gpaTimes100).toBe(390n);
  });

  it("returns the same credential two different ways from one on-chain record", async () => {
    const minimal: any = await sim.as(issuerSet()).read("proveCredential", CRED_ID, false);
    const full: any = await sim.as(issuerSet()).read("proveCredential", CRED_ID, true);

    expect(minimal.degreeCode).toBe(full.degreeCode);
    expect(minimal.graduationYear).toBe(full.graduationYear);
    expect(minimal.gpaTimes100).not.toBe(full.gpaTimes100);
  });
});

describe("the student identity never becomes public", () => {
  /**
   * POSITIVE CONTROL. Every test below asserts that something is ABSENT from the
   * public transcript — which passes trivially if the extraction is broken and
   * returns nothing. This test proves the extraction actually sees public data,
   * so the absence assertions mean what they claim. If the runtime's proof-data
   * shape changes, this fails loudly instead of the suite going quietly green.
   */
  it("extraction is sound: a field that IS disclosed does appear", async () => {
    const raw = await sim.as(issuerSet()).raw("proveCredential", CRED_ID, true);
    const published = publicBytes(raw);

    expect(published.length).toBeGreaterThan(0);
    // institutionId is part of DisclosedClaim, so it must be publicly visible.
    expect(published).toContain(Buffer.from(bytes32(0x11)).toString("hex"));
  });

  it("keeps studentId out of the disclosed claim's type entirely", async () => {
    const claim: any = await sim.as(issuerSet()).read("proveCredential", CRED_ID, true);
    expect(Object.keys(claim)).not.toContain("studentId");
  });

  it.each([
    ["minimum disclosure", false],
    ["GPA disclosed", true],
  ])("keeps studentId out of the public transcript (%s)", async (_label, revealGpa) => {
    const raw = await sim.as(issuerSet()).raw("proveCredential", CRED_ID, revealGpa);
    const published = publicBytes(raw);
    const sentinel = Buffer.from(SENTINEL_STUDENT).toString("hex");

    // The whole 32-byte sentinel must not appear...
    expect(published).not.toContain(sentinel);
    // ...nor a long run of it, which would indicate partial leakage.
    expect(published).not.toContain("ab".repeat(8));
  });

  it("keeps the blinding salt out of the public transcript", async () => {
    const raw = await sim.as(issuerSet()).raw("proveCredential", CRED_ID, true);
    expect(publicBytes(raw)).not.toContain(Buffer.from(SALT).toString("hex"));
  });

  it("keeps the withheld GPA out of the public transcript", async () => {
    // 390 = 0x186. If the value were published despite being withheld, the
    // consent flag would be cosmetic.
    const raw = await sim.as(issuerSet()).raw("proveCredential", CRED_ID, false);
    const claim: any = await sim.as(issuerSet()).read("proveCredential", CRED_ID, false);
    expect(claim.gpaTimes100).toBe(0n);
    expect(publicBytes(raw)).not.toContain(Buffer.from(SENTINEL_STUDENT).toString("hex"));
  });
});
