/**
 * "Tested restores" — deployment.md's literal bar, not just "code that could
 * theoretically restore." Fully self-contained: no devnet, no live adapter.
 *
 * The scenario that matters: the private-state volume is wiped (a fresh
 * container, `docker compose down -v`, a bad deploy). Restoring from a backup
 * must reproduce byte-identical fields and salts in a completely FRESH vault —
 * not just "the export function ran without throwing."
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Vault, type VaultEntry } from "../../src/vault/store.js";
import { exportVault, importVault, readBackupFile, writeBackupFile } from "../../src/vault/backup.js";

const bytes32 = (fill: number) => new Uint8Array(32).fill(fill);

function sampleEntry(seed: number): VaultEntry {
  return {
    fields: {
      studentId: bytes32(seed),
      issuerPk: bytes32(seed + 1),
      institutionId: bytes32(seed + 2),
      degreeCode: BigInt(1000 + seed),
      graduationYear: 2026n,
      gpaTimes100: BigInt(300 + seed),
    },
    salt: bytes32(seed + 99),
  };
}

let workDir: string;
let sourceVault: Vault;
let sourcePath: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "vault-backup-test-"));
  sourcePath = join(workDir, "source-vault");
  sourceVault = new Vault(sourcePath);
});

afterEach(async () => {
  await sourceVault.close().catch(() => {});
  rmSync(workDir, { recursive: true, force: true });
});

describe("export -> fresh vault -> import", () => {
  it("restores byte-identical fields and salts into a completely fresh store", async () => {
    await sourceVault.put("ACAD-2026-000001", sampleEntry(1));
    await sourceVault.put("ACAD-2026-000002", sampleEntry(2));
    await sourceVault.put("ACAD-2026-000003", sampleEntry(3));

    const backup = await exportVault(sourceVault, "correct horse battery staple");
    expect(backup.entryCount).toBe(3);

    const backupPath = join(workDir, "backup.json");
    writeBackupFile(backupPath, backup);

    // Simulates the volume being wiped: a vault at a path that has NEVER seen
    // these credentials, constructed fresh, no relation to sourceVault.
    const freshPath = join(workDir, "fresh-vault-after-wipe");
    const freshVault = new Vault(freshPath);
    try {
      const restoredFile = readBackupFile(backupPath);
      const count = await importVault(freshVault, "correct horse battery staple", restoredFile);
      expect(count).toBe(3);

      for (const [id, seed] of [
        ["ACAD-2026-000001", 1],
        ["ACAD-2026-000002", 2],
        ["ACAD-2026-000003", 3],
      ] as const) {
        const restored = await freshVault.get(id);
        const original = sampleEntry(seed);
        expect(restored).not.toBeNull();
        expect(restored!.salt).toEqual(original.salt);
        expect(restored!.fields.studentId).toEqual(original.fields.studentId);
        expect(restored!.fields.issuerPk).toEqual(original.fields.issuerPk);
        expect(restored!.fields.institutionId).toEqual(original.fields.institutionId);
        expect(restored!.fields.degreeCode).toBe(original.fields.degreeCode);
        expect(restored!.fields.graduationYear).toBe(original.fields.graduationYear);
        expect(restored!.fields.gpaTimes100).toBe(original.fields.gpaTimes100);
      }

      // The property that makes this recoverable at all: a credential in the
      // freshly-restored vault can still be proven, i.e. the restored salt+
      // fields still open the same commitment the contract holds. Exercised
      // end-to-end against the live devnet in salt-leak-check.ts / smoke.ts;
      // here we only guarantee the bytes survive the round trip intact, which
      // is the precondition for that to hold.
    } finally {
      await freshVault.close();
    }
  });

  it("handles an empty vault without error", async () => {
    const backup = await exportVault(sourceVault, "pw");
    expect(backup.entryCount).toBe(0);

    const freshVault = new Vault(join(workDir, "fresh-empty"));
    try {
      const count = await importVault(freshVault, "pw", backup);
      expect(count).toBe(0);
    } finally {
      await freshVault.close();
    }
  });

  it("overwrites an existing entry on restore rather than erroring", async () => {
    const freshVault = new Vault(join(workDir, "fresh-overwrite"));
    try {
      await freshVault.put("ACAD-2026-000001", sampleEntry(999)); // stale/wrong data
      await sourceVault.put("ACAD-2026-000001", sampleEntry(1));
      const backup = await exportVault(sourceVault, "pw");

      await importVault(freshVault, "pw", backup);
      const restored = await freshVault.get("ACAD-2026-000001");
      expect(restored!.fields.degreeCode).toBe(sampleEntry(1).fields.degreeCode);
    } finally {
      await freshVault.close();
    }
  });
});

describe("wrong passphrase fails loudly", () => {
  it("rejects rather than silently producing garbage", async () => {
    await sourceVault.put("ACAD-2026-000001", sampleEntry(1));
    const backup = await exportVault(sourceVault, "the-real-passphrase");

    const freshVault = new Vault(join(workDir, "fresh-wrong-pw"));
    try {
      await expect(importVault(freshVault, "a-guess", backup)).rejects.toThrow(
        /Could not decrypt/,
      );
      // Nothing should have been written on a failed decrypt.
      expect(await freshVault.has("ACAD-2026-000001")).toBe(false);
    } finally {
      await freshVault.close();
    }
  });
});

describe("backup file format", () => {
  it("never stores fields or salts in plaintext in the written file", async () => {
    await sourceVault.put("ACAD-2026-000001", sampleEntry(1));
    const backup = await exportVault(sourceVault, "pw");
    const backupPath = join(workDir, "backup.json");
    writeBackupFile(backupPath, backup);

    const raw = readBackupFile(backupPath);
    const rawJson = JSON.stringify(raw);
    const sentinelHex = Buffer.from(sampleEntry(1).salt).toString("hex");
    expect(rawJson).not.toContain(sentinelHex);
    // The only hex blobs on disk should be the KDF salt, IV, auth tag, and the
    // opaque ciphertext — none of which reveal anything about the credential.
    expect(Object.keys(raw).sort()).toEqual(
      ["authTag", "ciphertext", "createdAt", "entryCount", "iv", "kdfSalt", "version"].sort(),
    );
  });

  it("rejects an unsupported backup version", async () => {
    await sourceVault.put("x", sampleEntry(1));
    const backup = await exportVault(sourceVault, "pw");
    const freshVault = new Vault(join(workDir, "fresh-badversion"));
    try {
      await expect(
        importVault(freshVault, "pw", { ...backup, version: 2 as 1 }),
      ).rejects.toThrow(/Unsupported backup version/);
    } finally {
      await freshVault.close();
    }
  });
});
