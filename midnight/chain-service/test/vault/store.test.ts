/**
 * Regression test for a real bug found while testing vault backup/restore:
 * Vault.get() crashed instead of returning null for a genuinely never-written
 * key, because the installed `level` package resolves `db.get()` to
 * `undefined` for a missing key rather than throwing LEVEL_NOT_FOUND — the
 * only case the original code checked for.
 *
 * This matters far beyond a code-quality nit. In live.ts's prove(), vault.get()
 * is reached ONLY after confirming the credential exists on-chain — so the
 * one real-world scenario that hits this path is exactly the one
 * docs/deployment.md names: the private-state volume gets wiped, and a
 * previously-issued, genuinely valid credential's vault entry is gone.
 * Before this fix, that produced an uncaught crash (surfacing as a generic
 * 500) instead of the documented, specific 503 PROOF_MATERIAL_UNAVAILABLE —
 * silently, because every earlier test always issued a credential (writing
 * its vault entry) before ever proving it, so a truly-missing key was never
 * exercised against the real store until this test.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Vault } from "../../src/vault/store.js";

let workDir: string;
let vault: Vault;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "vault-store-test-"));
  vault = new Vault(join(workDir, "vault"));
});

afterEach(async () => {
  await vault.close().catch(() => {});
  rmSync(workDir, { recursive: true, force: true });
});

describe("Vault.get() on a never-written key", () => {
  it("resolves null rather than throwing", async () => {
    // No .put() call anywhere before this — the credential genuinely does not
    // exist in this vault, the way it wouldn't after a wiped volume.
    await expect(vault.get("ACAD-2026-NEVER-ISSUED")).resolves.toBeNull();
  });

  it("has() resolves false for the same case", async () => {
    await expect(vault.has("ACAD-2026-NEVER-ISSUED")).resolves.toBe(false);
  });
});

describe("Vault.get() after a real write", () => {
  it("still round-trips correctly (the fix didn't break the happy path)", async () => {
    const entry = {
      fields: {
        studentId: new Uint8Array(32).fill(1),
        issuerPk: new Uint8Array(32).fill(2),
        institutionId: new Uint8Array(32).fill(3),
        degreeCode: 4711n,
        graduationYear: 2026n,
        gpaTimes100: 390n,
      },
      salt: new Uint8Array(32).fill(9),
    };
    await vault.put("ACAD-2026-000001", entry);
    const back = await vault.get("ACAD-2026-000001");
    expect(back).not.toBeNull();
    expect(back!.fields.degreeCode).toBe(4711n);
    expect(back!.salt).toEqual(entry.salt);
    await expect(vault.has("ACAD-2026-000001")).resolves.toBe(true);
  });
});
