/**
 * HTTP-LEVEL end-to-end check — the gap smoke.ts and the unit tests leave.
 *
 * Everything tested elsewhere either (a) calls the ChainAdapter class directly
 * (smoke.ts, salt-leak-check.ts — bypassing Express entirely), or (b) sends
 * real HTTP requests but only against the MOCK adapter (test/http/*.test.ts).
 * Nothing had ever sent a real HTTP request to the Express server wired to the
 * LIVE adapter — so request parsing, zod validation, and the error middleware
 * had never been exercised together with the real chain. This script boots the
 * actual server (same createApp() index.ts uses) on a throwaway port with
 * CHAIN_MODE=live, and drives it purely over `fetch`, the way FastAPI or curl
 * actually will.
 *
 * Doubles as a literal reading of the Definition of Done: "Every endpoint has
 * a test against a local devnet" most naturally means hit the endpoint, not
 * call the underlying function.
 */
import { randomUUID } from "node:crypto";
import { assertNodeVersion, loadConfig } from "../config.js";
import { createLogger } from "../logging.js";
import { createApp } from "../http/app.js";
import { createLiveAdapter } from "../chain/live.js";
import { deriveIssuerSecretKey, GENESIS_SEED } from "../keys.js";
import { pureCircuits } from "../chain/contract.js";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];
const check = (step: string, ok: boolean, detail = "") => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
};

assertNodeVersion();
const config = loadConfig();
const logger = createLogger({ LOG_LEVEL: "warn" });

console.log("\nHTTP-level live-mode check — real fetch() against a real Express server\n");

const adapter = await createLiveAdapter(config, logger);
const app = createApp(adapter, config, logger);
const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", () => resolve()));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
const base = `http://127.0.0.1:${port}`;
console.log(`server listening on ${base}\n`);

const seed = config.MIDNIGHT_WALLET_SEED ?? GENESIS_SEED;
const issuerPk = Buffer.from(
  pureCircuits.publicKey(deriveIssuerSecretKey(seed, "demo-university")),
).toString("hex");
const credentialId = `ACAD-HTTP-${Date.now().toString().slice(-8)}`;

const json = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

try {
  // --- GET /chain/health -----------------------------------------------------
  const healthRes = await fetch(`${base}/chain/health`);
  const health = await json(healthRes);
  check("GET /chain/health -> 200", healthRes.status === 200, `ok=${health.ok}`);
  check(
    "health reports node/indexer/proofServer separately",
    ["node", "indexer", "proofServer"].every((k) => typeof health.services?.[k]?.ok === "boolean"),
  );

  // --- GET /chain/openapi.json -------------------------------------------------
  const openapiRes = await fetch(`${base}/chain/openapi.json`);
  check("GET /chain/openapi.json -> 200", openapiRes.status === 200);

  // --- POST /chain/issue -------------------------------------------------------
  const issueRes = await fetch(`${base}/chain/issue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      credentialId,
      fields: {
        studentId: randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64),
        issuerPk,
        institutionId: "a3f1".padEnd(64, "0"),
        degreeCode: 4711,
        graduationYear: 2026,
        gpaTimes100: 390,
      },
    }),
  });
  const issued = await json(issueRes);
  check("POST /chain/issue -> 201", issueRes.status === 201, `txId=${issued.txId?.slice(0, 12)}…`);

  // --- GET /chain/state/:id ----------------------------------------------------
  const stateRes = await fetch(`${base}/chain/state/${credentialId}`);
  const state = await json(stateRes);
  check("GET /chain/state/:id -> 200, exists", stateRes.status === 200 && state.exists === true);

  // --- POST /chain/prove (minimum disclosure) ----------------------------------
  const proveMinRes = await fetch(`${base}/chain/prove`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credentialId, disclose: [] }),
  });
  const proveMin = await json(proveMinRes);
  check(
    "POST /chain/prove -> 200 VALID, GPA withheld over real HTTP",
    proveMinRes.status === 200 && proveMin.status === "VALID" && proveMin.disclosed?.gpaTimes100 === null,
  );

  // --- POST /chain/prove (consented) -------------------------------------------
  const proveFullRes = await fetch(`${base}/chain/prove`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credentialId, disclose: ["gpa"] }),
  });
  const proveFull = await json(proveFullRes);
  check(
    "POST /chain/prove with disclose:[gpa] -> GPA revealed over real HTTP",
    proveFullRes.status === 200 && proveFull.disclosed?.gpaTimes100 === 390,
  );

  // --- zod validation actually runs on the real HTTP path ----------------------
  const badRes = await fetch(`${base}/chain/issue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credentialId: "X", fields: { studentId: "too-short" } }),
  });
  const bad = await json(badRes);
  check(
    "malformed POST /chain/issue -> 400 VALIDATION_ERROR (zod ran)",
    badRes.status === 400 && bad.error?.code === "VALIDATION_ERROR",
  );

  // --- unknown credential: 404, never confused with a forgery ------------------
  const notFoundRes = await fetch(`${base}/chain/prove`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credentialId: "ACAD-0000-NOPE" }),
  });
  const notFound = await json(notFoundRes);
  check(
    "unknown credential -> 404 NOT_FOUND over real HTTP",
    notFoundRes.status === 404 && notFound.error?.code === "NOT_FOUND",
  );

  // --- the mock-only debug endpoint must NOT exist against live -----------------
  const debugRes = await fetch(`${base}/chain/debug/tamper/${credentialId}`, { method: "POST" });
  check(
    "debug/tamper route absent when ALLOW_DEBUG_ENDPOINTS is unset (404)",
    debugRes.status === 404,
  );

  // --- POST /chain/revoke -------------------------------------------------------
  const revokeRes = await fetch(`${base}/chain/revoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credentialId }),
  });
  check("POST /chain/revoke -> 200 over real HTTP", revokeRes.status === 200);

  const afterRevokeRes = await fetch(`${base}/chain/prove`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credentialId }),
  });
  const afterRevoke = await json(afterRevokeRes);
  check("verify after revoke -> 200 REVOKED over real HTTP", afterRevoke.status === "REVOKED");

  // --- every response carries a request id, per the error-envelope contract ----
  check(
    "every response carries x-request-id",
    [healthRes, issueRes, proveMinRes, notFoundRes].every((r) => !!r.headers.get("x-request-id")),
  );
} finally {
  server.close();
  await adapter.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length === 0 ? 0 : 1);
