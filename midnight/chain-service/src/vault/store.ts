/**
 * The witness vault: credentialId -> { fields, salt }.
 *
 * This is the actual privacy boundary of the product, and it has an unusual
 * property worth stating plainly:
 *
 *   LOST   -> those credentials can never be proven again. The salt is random
 *             and cannot be re-derived. Reissue is the only remedy.
 *   LEAKED -> the on-chain commitments become openable and the credentials'
 *             fields are exposed.
 *
 * So it is neither a cache nor an ordinary database. Back it up like key
 * material, and never run it on an ephemeral container filesystem.
 */
import { Level } from "level";
import type { CredentialDataWitness } from "../chain/witnesses.js";

export interface VaultEntry {
  fields: CredentialDataWitness;
  salt: Uint8Array;
}

interface StoredEntry {
  fields: {
    studentId: string;
    issuerPk: string;
    institutionId: string;
    degreeCode: string;
    graduationYear: string;
    gpaTimes100: string;
  };
  salt: string;
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const bytes = (h: string) => Uint8Array.from(Buffer.from(h, "hex"));

export class Vault {
  private readonly db: Level<string, StoredEntry>;

  constructor(path: string) {
    this.db = new Level<string, StoredEntry>(path, { valueEncoding: "json" });
  }

  private static encode(e: VaultEntry): StoredEntry {
    return {
      fields: {
        studentId: hex(e.fields.studentId),
        issuerPk: hex(e.fields.issuerPk),
        institutionId: hex(e.fields.institutionId),
        degreeCode: e.fields.degreeCode.toString(),
        graduationYear: e.fields.graduationYear.toString(),
        gpaTimes100: e.fields.gpaTimes100.toString(),
      },
      salt: hex(e.salt),
    };
  }

  private static decode(s: StoredEntry): VaultEntry {
    return {
      fields: {
        studentId: bytes(s.fields.studentId),
        issuerPk: bytes(s.fields.issuerPk),
        institutionId: bytes(s.fields.institutionId),
        degreeCode: BigInt(s.fields.degreeCode),
        graduationYear: BigInt(s.fields.graduationYear),
        gpaTimes100: BigInt(s.fields.gpaTimes100),
      },
      salt: bytes(s.salt),
    };
  }

  async put(credentialId: string, entry: VaultEntry): Promise<void> {
    await this.db.put(credentialId, Vault.encode(entry));
  }

  /**
   * Returns null when absent — callers MUST map that to a 503, never to a
   * credential verdict. This is the exact path a wiped private-state volume
   * takes (see docs/deployment.md), so it has to be right.
   *
   * The underlying store is not consistent about HOW it reports "missing":
   * verified directly against the installed `level` package that `db.get()`
   * resolves `undefined` for an absent key rather than throwing
   * LEVEL_NOT_FOUND — so a version that only checked for a thrown error (as
   * this originally did) never actually triggers, and Vault.decode(undefined)
   * crashes instead of returning null. Handle BOTH shapes, since different
   * `level`/`abstract-level` versions or backends could exhibit either.
   */
  async get(credentialId: string): Promise<VaultEntry | null> {
    try {
      const raw = await this.db.get(credentialId);
      if (raw === undefined) return null;
      return Vault.decode(raw);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "LEVEL_NOT_FOUND") return null;
      throw e;
    }
  }

  async has(credentialId: string): Promise<boolean> {
    return (await this.get(credentialId)) !== null;
  }

  /** Walk every entry — the primitive backup.ts is built on. */
  async *entries(): AsyncGenerator<[string, VaultEntry]> {
    for await (const [key, value] of this.db.iterator()) {
      yield [key, Vault.decode(value)];
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
