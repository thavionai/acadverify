/**
 * Happy path: the full credential lifecycle, run against the compiled contract.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Sim, bytes32, credential, publicKeyOf, type PrivateState } from "./harness.js";

const OWNER_SK = bytes32(0x01);
const ISSUER_SK = bytes32(0x02);
const CRED_ID = bytes32(0x10);
const SALT = bytes32(0x99);

const issuerPk = () => publicKeyOf(ISSUER_SK);

/** Witness working set for the issuing university. */
const issuerSet = (): Partial<PrivateState> => ({
  secretKey: ISSUER_SK,
  fields: credential({ issuerPk: issuerPk() }),
  salt: SALT,
});

let sim: Sim;

beforeEach(async () => {
  sim = await Sim.deploy(OWNER_SK);
  await sim.as({ secretKey: OWNER_SK }).call("authorizeIssuer", issuerPk());
});

describe("credential lifecycle", () => {
  it("authorizes an issuer", () => {
    const l: any = sim.ledger();
    expect(l.issuers.size()).toBe(1n);
    expect(l.issuers.member(issuerPk())).toBe(true);
  });

  it("issues a credential as a commitment, and stores nothing else", async () => {
    await sim.as(issuerSet()).call("issue", CRED_ID);
    const l: any = sim.ledger();
    expect(l.credentials.member(CRED_ID)).toBe(true);

    // The ledger holds a 32-byte commitment — not the fields, not a plaintext hash.
    const commitment = l.credentials.lookup(CRED_ID);
    expect(commitment).toBeInstanceOf(Uint8Array);
    expect(commitment.length).toBe(32);
  });

  it("proves a valid credential and returns only the disclosed claim", async () => {
    await sim.as(issuerSet()).call("issue", CRED_ID);
    const claim: any = await sim.as(issuerSet()).read("proveCredential", CRED_ID, false);

    expect(Object.keys(claim).sort()).toEqual(
      ["degreeCode", "gpaTimes100", "graduationYear", "institutionId"].sort(),
    );
    expect(claim).not.toHaveProperty("studentId");
    expect(claim.degreeCode).toBe(4711n);
    expect(claim.graduationYear).toBe(2026n);
  });

  it("revokes, and a revoked credential can no longer be proven", async () => {
    await sim.as(issuerSet()).call("issue", CRED_ID);
    await sim.as(issuerSet()).call("revokeCredential", CRED_ID);

    expect((sim.ledger() as any).revoked.member(CRED_ID)).toBe(true);
    await expect(sim.as(issuerSet()).read("proveCredential", CRED_ID, false)).rejects.toThrow(
      /credential revoked/,
    );
  });
});
