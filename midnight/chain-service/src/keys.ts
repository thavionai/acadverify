import { createHash } from "node:crypto";

/**
 * Local devnet genesis seed. The dev chain-spec pre-mints NIGHT (and DUST) to
 * the wallet derived from it, so no faucet or funding flow is needed locally.
 * PUBLIC AND WORTHLESS — never use outside a local devnet.
 */
export const GENESIS_SEED = `${"0".repeat(63)}1`;

/**
 * Contract-level secret keys are DERIVED from the wallet seed rather than stored.
 *
 * That matters operationally: if the private-state store is wiped, only the
 * per-credential salts are lost — the ability to authorize issuers and to issue
 * survives. Salts stay random, which is what preserves the erasure property
 * (delete the salt and the commitment is permanently unopenable).
 */
function derive(seed: string, domain: string): Uint8Array {
  return Uint8Array.from(createHash("sha256").update(`${seed}:${domain}`).digest());
}

export const derivePlatformOwnerSecretKey = (seed: string): Uint8Array =>
  derive(seed, "acadverify:platform-owner");

export const deriveIssuerSecretKey = (seed: string, institutionId: string): Uint8Array =>
  derive(seed, `acadverify:issuer:${institutionId}`);
