/**
 * End-to-end lifecycle against the LIVE devnet.
 *
 * Doubles as the demo rehearsal script: it walks exactly the beats the judges
 * see. Prints a pass/fail table and exits non-zero on any failure.
 */
import { randomUUID } from "node:crypto";
import { createLiveAdapter } from "../chain/live.js";
import { loadConfig } from "../config.js";
import { createLogger } from "../logging.js";
import { deriveIssuerSecretKey, GENESIS_SEED } from "../keys.js";
import { pureCircuits } from "../chain/contract.js";
import type { CredentialFields } from "../chain/ports.js";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];
const check = (step: string, ok: boolean, detail = "") => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
};

const config = loadConfig();
const logger = createLogger({ LOG_LEVEL: "warn" });
const seed = config.MIDNIGHT_WALLET_SEED ?? GENESIS_SEED;
const issuerPk = Buffer.from(
  pureCircuits.publicKey(deriveIssuerSecretKey(seed, "demo-university")),
).toString("hex");

const fields = (gpa: number): CredentialFields => ({
  studentId: Buffer.from(randomUUID().replace(/-/g, "").padEnd(64, "0")).toString("hex").slice(0, 64),
  issuerPk,
  institutionId: "a3f1".padEnd(64, "0"),
  degreeCode: 4711,
  graduationYear: 2026,
  gpaTimes100: gpa,
});

const suffix = Date.now().toString().slice(-6);
const GOOD = `ACAD-2026-${suffix}A`;
const FORGED = `ACAD-2026-${suffix}B`;

console.log("\nAcadVerify — end-to-end lifecycle on the live devnet\n");
const adapter = await createLiveAdapter(config, logger);

try {
  const health = await adapter.health();
  check("health: all three Midnight services reachable", health.ok,
    `node=${health.services.node.ok} indexer=${health.services.indexer.ok} proof=${health.services.proofServer.ok}`);

  const issued = await adapter.issue(GOOD, "demo-university", fields(390));
  check("issue: commitment written on-chain", !!issued.commitment,
    `tx=${issued.txId.slice(0, 12)}… proving=${issued.provingMs}ms`);

  const st = await adapter.state(GOOD);
  check("state: credential exists, not revoked", st.exists && !st.revoked);

  const minimal = await adapter.prove(GOOD, []);
  check("verify (minimum disclosure): VALID, GPA withheld",
    minimal.status === "VALID" && minimal.disclosed?.gpaTimes100 === null,
    `withheld=[${minimal.withheld.join(", ")}]`);

  const full = await adapter.prove(GOOD, ["gpa"]);
  check("verify (consented): VALID, GPA disclosed",
    full.status === "VALID" && full.disclosed?.gpaTimes100 === 390,
    `gpa=${full.disclosed?.gpaTimes100}`);

  check("same on-chain record, two different disclosures",
    minimal.evidence.commitment === full.evidence.commitment &&
      minimal.disclosed?.gpaTimes100 !== full.disclosed?.gpaTimes100);

  check("student identity withheld under BOTH disclosures",
    minimal.withheld.includes("studentId") && full.withheld.includes("studentId"));

  await adapter.issue(FORGED, "demo-university", fields(400));
  await adapter.tamper!(FORGED);
  const forged = await adapter.prove(FORGED, []);
  check("forgery: tampered credential cannot be proven",
    forged.status === "INVALID_PROOF" && forged.disclosed === null,
    `status=${forged.status}`);

  const rev = await adapter.revoke(GOOD, "demo-university");
  check("revoke: submitted on-chain", !!rev.txId, `tx=${rev.txId.slice(0, 12)}…`);

  const afterRevoke = await adapter.prove(GOOD, []);
  check("verify after revoke: REVOKED", afterRevoke.status === "REVOKED");

  let notFound = false;
  try {
    await adapter.prove("ACAD-0000-NOPE", []);
  } catch (e: any) {
    notFound = e?.code === "NOT_FOUND";
  }
  check("unknown credential: 404, not a forgery accusation", notFound);
} finally {
  await adapter.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length === 0 ? 0 : 1);
