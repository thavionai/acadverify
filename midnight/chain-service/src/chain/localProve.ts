/**
 * The verification engine.
 *
 * Verification does NOT submit a transaction. The disclosed claim is the
 * circuit's public OUTPUT, so submitting a proveCredential transaction would
 * permanently publish the disclosure — a standing public record that credential
 * X is a 2026 AI Master's with a 3.9 GPA. That is exactly what data-model.md
 * forbids: the ledger holds commitments, the issuer set, and revocation flags,
 * and nothing else.
 *
 * Instead the COMPILED CIRCUIT is executed locally against the live on-chain
 * state fetched from the indexer. Same asserts, same persistentCommit, same
 * commitment comparison against the same ledger map. The DisclosedClaim is
 * produced by the circuit, not reassembled by hand, so the rule that "the
 * circuit is the only place that arithmetic happens" holds literally.
 *
 * The proof goes to the verifier rather than to the ledger — the same shape as a
 * W3C Verifiable Credential presentation.
 */
import { createCircuitContext } from "@midnight-ntwrk/compact-runtime";
import * as ContractModule from "../../managed/academic_credential/contract/index.js";
import { witnesses, type AcadPrivateState } from "./witnesses.js";

const COIN_PK = "0".repeat(64);

export interface RawDisclosedClaim {
  institutionId: Uint8Array;
  degreeCode: bigint;
  graduationYear: bigint;
  gpaTimes100: bigint;
}

/** Assert messages the circuit can raise, mapped to what they mean. */
export type ProveFailure =
  | "unknown credential"
  | "commitment mismatch"
  | "credential revoked"
  | "issuer not authorized";

export class CircuitAssertError extends Error {
  constructor(readonly reason: ProveFailure | "unknown") {
    super(`circuit assert: ${reason}`);
    this.name = "CircuitAssertError";
  }
}

function classify(message: string): ProveFailure | "unknown" {
  for (const r of [
    "unknown credential",
    "commitment mismatch",
    "credential revoked",
    "issuer not authorized",
  ] as const) {
    if (message.includes(r)) return r;
  }
  return "unknown";
}

/**
 * Execute proveCredential against live chain state.
 *
 * A tampered credential does not produce a "false" result here — the commitment
 * assert aborts and there is no output at all. That is why forgery is unprovable
 * rather than merely detected.
 */
export function proveLocally(
  contractAddress: string,
  chargedState: unknown,
  privateState: AcadPrivateState,
  credentialIdBytes: Uint8Array,
  revealGpa: boolean,
): RawDisclosedClaim {
  // biome-ignore lint: the generated Contract type is intentionally loose
  const contract = new (ContractModule.Contract as any)(witnesses);
  const ctx = createCircuitContext(
    contractAddress as never,
    COIN_PK as never,
    chargedState as never,
    privateState,
  );

  try {
    const res = contract.circuits.proveCredential(ctx, credentialIdBytes, revealGpa);
    return res.result as RawDisclosedClaim;
  } catch (e: unknown) {
    throw new CircuitAssertError(classify(e instanceof Error ? e.message : String(e)));
  }
}
