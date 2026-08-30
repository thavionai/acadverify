/**
 * The seam. `mock` and `live` are two implementations of this one interface, and
 * the HTTP layer only ever talks to the interface — so flipping CHAIN_MODE from
 * mock to live changes nothing for any consumer. There is no integration cliff
 * because there is no second artifact.
 */

/** Exactly what a verification may reveal. Note the absence of studentId. */
export interface DisclosedClaim {
  institutionId: string;
  degreeCode: number;
  graduationYear: number;
  /** null when withheld. NEVER 0 — a real 0.00 GPA must stay distinguishable. */
  gpaTimes100: number | null;
}

export interface CredentialFields {
  studentId: string;
  /**
   * Filled by the adapter from the key it signs with — never accepted over
   * HTTP (see CredentialFieldsSchema). The circuit asserts
   * fields.issuerPk == publicKey(localSecretKey()), so a caller-supplied value
   * could only agree or lie.
   */
  issuerPk?: string;
  institutionId: string;
  degreeCode: number;
  graduationYear: number;
  gpaTimes100: number;
}

export type VerifyStatus = "VALID" | "REVOKED" | "INVALID_PROOF";

export interface ProveResult {
  status: VerifyStatus;
  disclosed: DisclosedClaim | null;
  withheld: string[];
  evidence: {
    contractAddress: string | null;
    networkId: string;
    commitment: string | null;
    /** The ISSUANCE transaction. Verification does not submit one — see docs. */
    issuanceTxId: string | null;
    stateBlockHeight: number | null;
    checkedAt: string;
  };
  proof: {
    level: "circuit-checked" | "zk-verified";
    verified: boolean;
    provingMs: number;
  };
}

export interface IssueResult {
  credentialId: string;
  txId: string;
  blockHeight: number | null;
  commitment: string;
  contractAddress: string | null;
  networkId: string;
  provingMs: number;
  submittedAt: string;
}

export interface RevokeResult {
  credentialId: string;
  txId: string;
  blockHeight: number | null;
  revokedAt: string;
}

export interface StateResult {
  credentialId: string;
  exists: boolean;
  revoked: boolean;
  commitment: string | null;
  contractAddress: string | null;
  networkId: string;
  blockHeight: number | null;
}

export interface ServiceHealth {
  ok: boolean;
  latencyMs: number | null;
  error?: string;
}

export interface HealthResult {
  ok: boolean;
  mode: "mock" | "live";
  networkId: string;
  contractAddress: string | null;
  /** Reported separately: "the chain is down" is not actionable when the node is
   *  fine and only the proof server is saturated. */
  services: {
    node: ServiceHealth;
    indexer: ServiceHealth;
    proofServer: ServiceHealth;
  };
  wallet: { synced: boolean; dustAvailable: string | null } | null;
}

export interface ChainAdapter {
  readonly mode: "mock" | "live";
  health(): Promise<HealthResult>;
  /**
   * Authorise an institution to issue. Pass `institutionId` and the adapter
   * derives that institution's key; pass `issuerPk` to authorise a key held
   * elsewhere (the operator script).
   */
  authorizeIssuer(
    identity: { institutionId?: string; issuerPk?: string },
  ): Promise<{ txId: string; blockHeight: number | null; issuerPk: string }>;
  issue(
    credentialId: string,
    institutionId: string,
    fields: CredentialFields,
  ): Promise<IssueResult>;
  revoke(credentialId: string, institutionId: string): Promise<RevokeResult>;
  prove(credentialId: string, disclose: string[]): Promise<ProveResult>;
  state(credentialId: string): Promise<StateResult>;
  /** Demo-only: corrupt stored witness data so the forgery beat is a live click. */
  tamper?(credentialId: string): Promise<{ tampered: boolean }>;
  close(): Promise<void>;
}
