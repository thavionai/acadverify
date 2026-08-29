/**
 * Encrypted export/import for the witness vault.
 *
 * deployment.md names this specifically: "encrypted backups with tightly
 * scoped access, restores tested." An UNENCRYPTED backup of credential fields
 * and salts would itself be exactly the P0-class leak data-model.md warns
 * about for logs — just moved into a file instead of a log line. AES-256-GCM
 * via node:crypto (no new dependency), key derived from a passphrase via
 * scrypt.
 *
 * A wrong passphrase must fail LOUDLY (the GCM auth tag check does this) —
 * never silently accept a partially- or incorrectly-decrypted vault.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { Vault, VaultEntry } from "./store.js";

const ALGO = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

export interface BackupFile {
  version: 1;
  createdAt: string;
  entryCount: number;
  kdfSalt: string; // hex
  iv: string; // hex
  authTag: string; // hex
  ciphertext: string; // hex
}

interface BytesMarker {
  __bytes: string;
}
interface BigIntMarker {
  __bigint: string;
}
const isBytesMarker = (v: unknown): v is BytesMarker =>
  typeof v === "object" && v !== null && "__bytes" in v;
const isBigIntMarker = (v: unknown): v is BigIntMarker =>
  typeof v === "object" && v !== null && "__bigint" in v;

/** Uint8Array and bigint don't survive JSON.stringify on their own. */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) return { __bytes: Buffer.from(value).toString("hex") };
  if (typeof value === "bigint") return { __bigint: value.toString() };
  return value;
}
function reviver(_key: string, value: unknown): unknown {
  if (isBytesMarker(value)) return Uint8Array.from(Buffer.from(value.__bytes, "hex"));
  if (isBigIntMarker(value)) return BigInt(value.__bigint);
  return value;
}

/** Walk `vault` and produce an encrypted, self-contained backup object. */
export async function exportVault(vault: Vault, passphrase: string): Promise<BackupFile> {
  const entries: Record<string, VaultEntry> = {};
  let entryCount = 0;
  for await (const [id, entry] of vault.entries()) {
    entries[id] = entry;
    entryCount++;
  }
  const plaintext = Buffer.from(JSON.stringify(entries, replacer), "utf8");

  const kdfSalt = randomBytes(SALT_LENGTH);
  const key = scryptSync(passphrase, kdfSalt, KEY_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    entryCount,
    kdfSalt: kdfSalt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
}

/**
 * Decrypt `file` and write every entry into `vault`. Returns the number of
 * entries restored. Existing entries with the same credentialId are
 * overwritten — a restore is expected to reproduce the backed-up state.
 */
export async function importVault(
  vault: Vault,
  passphrase: string,
  file: BackupFile,
): Promise<number> {
  if (file.version !== 1) {
    throw new Error(`Unsupported backup version: ${String(file.version)}`);
  }

  const key = scryptSync(passphrase, Buffer.from(file.kdfSalt, "hex"), KEY_LENGTH);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(file.iv, "hex"));
  decipher.setAuthTag(Buffer.from(file.authTag, "hex"));

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(file.ciphertext, "hex")),
      decipher.final(),
    ]);
  } catch {
    throw new Error("Could not decrypt backup — wrong passphrase, or the file is corrupted.");
  }

  const entries = JSON.parse(plaintext.toString("utf8"), reviver) as Record<string, VaultEntry>;
  let count = 0;
  for (const [id, entry] of Object.entries(entries)) {
    await vault.put(id, entry);
    count++;
  }
  return count;
}

export function writeBackupFile(path: string, file: BackupFile): void {
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

export function readBackupFile(path: string): BackupFile {
  return JSON.parse(readFileSync(path, "utf8")) as BackupFile;
}
