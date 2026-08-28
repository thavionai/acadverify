/**
 * TypeScript implementations of the contract's three witnesses.
 *
 * Keys MUST match the Compact witness names exactly — the runtime looks them up
 * by name. Each returns [updatedPrivateState, value]; state first, value second.
 *
 * These read from a per-call "working set": the chain-service loads the fields
 * and salt for the credential being operated on, then invokes the circuit. That
 * swap is why every submitting operation is serialised behind a mutex — two
 * concurrent calls sharing this slot would commit one credential with another's
 * fields, producing a commitment that can never be opened.
 */
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";

export interface CredentialDataWitness {
  studentId: Uint8Array;
  issuerPk: Uint8Array;
  institutionId: Uint8Array;
  degreeCode: bigint;
  graduationYear: bigint;
  gpaTimes100: bigint;
}

export interface AcadPrivateState {
  /** The key acting in this call: platform owner, or an issuing university. */
  secretKey: Uint8Array;
  /** Working set for issue / proveCredential. */
  fields: CredentialDataWitness;
  /** Blinding factor. Losing it makes the credential permanently unprovable. */
  salt: Uint8Array;
}

type Ctx = WitnessContext<unknown, AcadPrivateState>;

export const witnesses = {
  localSecretKey: (ctx: Ctx): [AcadPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.secretKey,
  ],
  credentialFields: (ctx: Ctx): [AcadPrivateState, CredentialDataWitness] => [
    ctx.privateState,
    ctx.privateState.fields,
  ],
  credentialSalt: (ctx: Ctx): [AcadPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.salt,
  ],
};

/** Placeholder working set for calls that do not touch credential data. */
export function emptyWorkingSet(secretKey: Uint8Array): AcadPrivateState {
  const zero = new Uint8Array(32);
  return {
    secretKey,
    fields: {
      studentId: zero,
      issuerPk: zero,
      institutionId: zero,
      degreeCode: 0n,
      graduationYear: 0n,
      gpaTimes100: 0n,
    },
    salt: zero,
  };
}
