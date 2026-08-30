/**
 * Definition-of-done check, run against the live devnet:
 *
 *   "Salt handling has an explicit test proving salts never appear in
 *    responses or logs."
 *
 * The salt is generated randomly inside issue() (fresh Bytes<32> per
 * credential), so nothing outside can know its value ahead of time. Rather
 * than open a second handle on the same LevelDB to read it back (LevelDB
 * holds an OS-level file lock — a second concurrent open would deadlock
 * against the adapter's own open handle, even within one process), this
 * intercepts the value at its two real leak points directly:
 *
 *   1. Vault.prototype.put — the only place the salt is written to storage.
 *      Monkey-patched (not vi.spyOn, since this runs as a plain script, not a
 *      vitest test) to capture the argument before delegating to the original.
 *   2. Every argument passed to the logger's info/warn/error methods, raw,
 *      BEFORE pino's own redaction config touches it. This is a stronger
 *      check than asserting on pino's rendered output: it proves the
 *      application never hands the salt to the logger in the first place,
 *      rather than relying on the redact-path list (`*.salt`, etc.) as the
 *      only line of defence. It also catches the salt appearing under an
 *      unexpected key, not just a key literally named "salt".
 *
 * Exits non-zero on any leak found.
 */
import { Vault, type VaultEntry } from "../vault/store.js";
import { createLiveAdapter } from "../chain/live.js";
import { loadConfig } from "../config.js";
import { createLogger } from "../logging.js";
import { deriveIssuerSecretKey, GENESIS_SEED } from "../keys.js";
import { pureCircuits } from "../chain/contract.js";
import type { CredentialFields } from "../chain/ports.js";

const results: Array<{ check: string; ok: boolean; detail?: string }> = [];
const record = (check: string, ok: boolean, detail?: string) => {
  results.push({ check, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${check}${detail ? ` — ${detail}` : ""}`);
};

// --- 1. Capture the salt at its only write point -----------------------------
let capturedSalt: Uint8Array | null = null;
const originalPut = Vault.prototype.put;
Vault.prototype.put = async function (credentialId: string, entry: VaultEntry) {
  capturedSalt = entry.salt;
  return originalPut.call(this, credentialId, entry);
};

// --- 2. Capture every raw object handed to the logger, pre-redaction --------
const loggedPayloads: unknown[] = [];
const config = loadConfig();
const logger = createLogger(config);
for (const level of ["info", "warn", "error", "debug", "trace", "fatal"] as const) {
  const original = logger[level].bind(logger);
  (logger as any)[level] = (...args: unknown[]) => {
    loggedPayloads.push(...args);
    return (original as (...a: unknown[]) => unknown)(...args);
  };
}

console.log("\nSalt leak check — issuing a credential and inspecting every surface\n");

const adapter = await createLiveAdapter(config, logger);
try {
  const seed = config.MIDNIGHT_WALLET_SEED ?? GENESIS_SEED;
  const issuerPk = Buffer.from(
    pureCircuits.publicKey(deriveIssuerSecretKey(seed, "demo-university")),
  ).toString("hex");
  const fields: CredentialFields = {
    studentId: "cd".repeat(32),
    issuerPk,
    institutionId: "a3f1".padEnd(64, "0"),
    degreeCode: 4711,
    graduationYear: 2026,
    gpaTimes100: 390,
  };
  const credentialId = `ACAD-SALT-${Date.now().toString().slice(-8)}`;

  const issueResult = await adapter.issue(credentialId, "demo-university", fields);
  record("issue() actually wrote a salt (precondition for this check)", capturedSalt !== null);
  if (!capturedSalt) {
    console.log("\nCannot proceed without a captured salt — aborting.\n");
    process.exit(1);
  }
  const saltHex = Buffer.from(capturedSalt).toString("hex");

  const proveMinimal = await adapter.prove(credentialId, []);
  const proveFull = await adapter.prove(credentialId, ["gpa"]);

  const issueJson = JSON.stringify(issueResult);
  const proveMinimalJson = JSON.stringify(proveMinimal);
  const proveFullJson = JSON.stringify(proveFull);
  const allLogsJson = JSON.stringify(loggedPayloads);

  record("salt absent from IssueResult", !issueJson.includes(saltHex));
  record("salt absent from ProveResult (minimum disclosure)", !proveMinimalJson.includes(saltHex));
  record("salt absent from ProveResult (GPA disclosed)", !proveFullJson.includes(saltHex));
  record(
    `salt absent from all ${loggedPayloads.length} raw log payloads (pre-redaction)`,
    !allLogsJson.includes(saltHex),
  );

  // Also confirm the vault write itself doesn't echo the plaintext salt through
  // any OTHER public-facing field by accident (belt and suspenders).
  record(
    "no response object has a top-level or nested key literally named 'salt'",
    !/"salt"\s*:/i.test(issueJson + proveMinimalJson + proveFullJson),
  );
} finally {
  Vault.prototype.put = originalPut;
  await adapter.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length === 0 ? 0 : 1);
