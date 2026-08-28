/**
 * Type conversions across the three boundaries this service straddles:
 * JSON (strings/numbers) <-> Compact (Uint8Array/bigint) <-> HTTP.
 *
 * Compact type mapping:
 *   Bytes<32>  <-> Uint8Array(32)  <-> 64 lowercase hex chars on the wire
 *   Uint<N>    <-> bigint          <-> JSON number
 *   Boolean    <-> boolean
 */
import { createHash } from "node:crypto";

const HEX32 = /^[0-9a-f]{64}$/;

export function hexToBytes32(hex: string, label = "value"): Uint8Array {
  const normalised = hex.startsWith("0x") ? hex.slice(2) : hex;
  const lower = normalised.toLowerCase();
  if (!HEX32.test(lower)) {
    throw new Error(`${label} must be 64 hex characters (32 bytes), got ${normalised.length} chars`);
  }
  return Uint8Array.from(Buffer.from(lower, "hex"));
}

export function bytes32ToHex(bytes: Uint8Array): string {
  if (bytes.length !== 32) throw new Error(`expected 32 bytes, got ${bytes.length}`);
  return Buffer.from(bytes).toString("hex");
}

/**
 * Map the human credential identifier (`ACAD-2026-000123`, printed in the QR
 * code) to the `Bytes<32>` the contract keys its ledger map on.
 *
 * IMPORTANT: this is an *identifier encoding*, not a commitment. It is a plain
 * hash of a public string and hides nothing — the credential's confidentiality
 * comes entirely from the blinded commitment computed in-circuit (see
 * docs/data-model.md). It lives here, off-chain, purely so the API can speak in
 * human ids while the contract speaks in fixed-width bytes.
 *
 * Normalised (trim + uppercase) so that casing or stray whitespace in a scanned
 * QR code cannot produce a different on-chain key for the same credential.
 */
export function credentialIdToBytes(credentialId: string): Uint8Array {
  const normalised = credentialId.trim().toUpperCase();
  if (normalised.length === 0) throw new Error("credentialId must not be empty");
  return Uint8Array.from(createHash("sha256").update(normalised, "utf8").digest());
}

export function toBigInt(n: number | bigint, label = "value"): bigint {
  if (typeof n === "bigint") return n;
  if (!Number.isInteger(n)) throw new Error(`${label} must be an integer, got ${n}`);
  return BigInt(n);
}

/** Serialise for JSON: bigints become numbers, byte arrays become hex. */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
  }
  return value;
}
