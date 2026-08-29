/**
 * Deterministic in-memory adapter so backend, frontend, and QA can build against
 * the real HTTP contract before the live chain wiring exists.
 *
 * This is NOT throwaway code: it implements the same ChainAdapter interface the
 * live adapter does, behind identical routes, schemas, and error mapping. When
 * CHAIN_MODE flips to live, consumers change nothing.
 */
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../http/errors.js";
import type {
  ChainAdapter,
  CredentialFields,
  HealthResult,
  IssueResult,
  ProveResult,
  RevokeResult,
  StateResult,
} from "./ports.js";

interface MockRecord {
  fields: CredentialFields;
  commitment: string;
  issuanceTxId: string;
  blockHeight: number;
  revoked: boolean;
  /** Simulates witness data that no longer matches the on-chain commitment. */
  tampered: boolean;
  /** Simulates a wiped private-state vault for this credential. */
  vaultMissing: boolean;
}

const MOCK_INSTITUTION = "a3f1".padEnd(64, "0");
const MOCK_ISSUER_PK = "b2e7".padEnd(64, "0");

function fakeCommitment(seed: string): string {
  return createHash("sha256").update(`mock-commitment:${seed}`).digest("hex");
}
function fakeTxId(seed: string): string {
  return createHash("sha256").update(`mock-tx:${seed}`).digest("hex");
}

function record(id: string, over: Partial<MockRecord> = {}): MockRecord {
  return {
    fields: {
      studentId: createHash("sha256").update(`student:${id}`).digest("hex"),
      issuerPk: MOCK_ISSUER_PK,
      institutionId: MOCK_INSTITUTION,
      degreeCode: 4711,
      graduationYear: 2026,
      gpaTimes100: 390,
    },
    commitment: fakeCommitment(id),
    issuanceTxId: fakeTxId(id),
    blockHeight: 1000 + Number(id.slice(-3)) || 1000,
    revoked: false,
    tampered: false,
    vaultMissing: false,
    ...over,
  };
}

/** Fixtures covering every state the frontend must render. */
function seed(): Map<string, MockRecord> {
  const m = new Map<string, MockRecord>();
  m.set("ACAD-2026-000001", record("ACAD-2026-000001"));
  m.set("ACAD-2026-000002", record("ACAD-2026-000002"));
  m.set("ACAD-2026-000003", record("ACAD-2026-000003", { revoked: true }));
  m.set("ACAD-2026-000004", record("ACAD-2026-000004", { tampered: true }));
  m.set("ACAD-2026-000005", record("ACAD-2026-000005", { vaultMissing: true }));
  return m;
}

export class MockChainAdapter implements ChainAdapter {
  readonly mode = "mock" as const;
  private readonly store = seed();
  private readonly issuers = new Set<string>([MOCK_ISSUER_PK]);

  constructor(private readonly networkId: string) {}

  private key(id: string): string {
    return id.trim().toUpperCase();
  }

  private get(id: string): MockRecord {
    const r = this.store.get(this.key(id));
    if (!r) throw AppError.notFound();
    return r;
  }

  async health(): Promise<HealthResult> {
    const up = { ok: true, latencyMs: 1 };
    return {
      ok: true,
      mode: this.mode,
      networkId: this.networkId,
      contractAddress: "mock000000000000000000000000000000000000000000000000000000000000",
      services: { node: up, indexer: up, proofServer: up },
      wallet: { synced: true, dustAvailable: "1000000" },
    };
  }

  async authorizeIssuer(issuerPk: string): Promise<{ txId: string; blockHeight: number | null }> {
    this.issuers.add(issuerPk);
    return { txId: fakeTxId(`authorize:${issuerPk}`), blockHeight: 900 };
  }

  async issue(credentialId: string, fields: CredentialFields): Promise<IssueResult> {
    const key = this.key(credentialId);
    if (this.store.has(key)) {
      throw new AppError("DUPLICATE_CREDENTIAL", `Credential ${credentialId} already exists.`);
    }
    if (!this.issuers.has(fields.issuerPk)) {
      throw new AppError("ISSUER_NOT_AUTHORIZED", "This issuer key is not authorized on-chain.");
    }
    const rec = record(key, { fields, commitment: fakeCommitment(key + randomUUID()) });
    this.store.set(key, rec);
    return {
      credentialId,
      txId: rec.issuanceTxId,
      blockHeight: rec.blockHeight,
      commitment: rec.commitment,
      contractAddress: (await this.health()).contractAddress,
      networkId: this.networkId,
      provingMs: 1200,
      submittedAt: new Date().toISOString(),
    };
  }

  async revoke(credentialId: string): Promise<RevokeResult> {
    const rec = this.get(credentialId);
    if (rec.revoked) {
      throw new AppError("CREDENTIAL_ALREADY_REVOKED", "This credential was already revoked.");
    }
    rec.revoked = true;
    return {
      credentialId,
      txId: fakeTxId(`revoke:${credentialId}`),
      blockHeight: rec.blockHeight + 5,
      revokedAt: new Date().toISOString(),
    };
  }

  async prove(credentialId: string, disclose: string[]): Promise<ProveResult> {
    const rec = this.get(credentialId);

    // A wiped vault is OUR failure, never the credential's. Without this the
    // naive path reports every real degree as forged.
    if (rec.vaultMissing) throw new AppError("PROOF_MATERIAL_UNAVAILABLE");

    const revealGpa = disclose.includes("gpa");
    const status = rec.tampered ? "INVALID_PROOF" : rec.revoked ? "REVOKED" : "VALID";

    const disclosed =
      status === "VALID"
        ? {
            institutionId: rec.fields.institutionId,
            degreeCode: rec.fields.degreeCode,
            graduationYear: rec.fields.graduationYear,
            // null, never 0 — driven by consent, not by the value.
            gpaTimes100: revealGpa ? rec.fields.gpaTimes100 : null,
          }
        : null;

    // `withheld` was derived from CONSENT alone, independent of status. When the
    // proof does not succeed nothing is disclosed at all, so reporting only
    // ["studentId"] under-stated it — and a consented-to gpa then appeared in
    // neither list: null in `disclosed`, absent from `withheld`.
    //
    // Whatever was not disclosed was withheld. Keep the two mutually exclusive
    // and jointly exhaustive so a verifier can trust the withheld list.
    const withheld = disclosed
      ? ["studentId", ...(revealGpa ? [] : ["gpa"])]
      : ["studentId", "gpa", "institutionId", "degreeCode", "graduationYear"];

    return {
      status,
      disclosed,
      withheld,
      evidence: {
        contractAddress: (await this.health()).contractAddress,
        networkId: this.networkId,
        commitment: rec.commitment,
        issuanceTxId: rec.issuanceTxId,
        stateBlockHeight: rec.blockHeight,
        checkedAt: new Date().toISOString(),
      },
      proof: { level: "circuit-checked", verified: status === "VALID", provingMs: 45 },
    };
  }

  async state(credentialId: string): Promise<StateResult> {
    const rec = this.get(credentialId);
    return {
      credentialId,
      exists: true,
      revoked: rec.revoked,
      commitment: rec.commitment,
      contractAddress: (await this.health()).contractAddress,
      networkId: this.networkId,
      blockHeight: rec.blockHeight,
    };
  }

  async tamper(credentialId: string): Promise<{ tampered: boolean }> {
    const rec = this.get(credentialId);
    rec.tampered = !rec.tampered;
    return { tampered: rec.tampered };
  }

  async close(): Promise<void> {}
}
