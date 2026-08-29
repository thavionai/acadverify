export type VerificationStatus = "VALID" | "REVOKED" | "INVALID_PROOF";

export type CredentialStatus = "ACTIVE" | "REVOKED";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "ISSUER_NOT_AUTHORIZED"
  | "NOT_FOUND"
  | "CREDENTIAL_ALREADY_REVOKED"
  | "DUPLICATE_CREDENTIAL"
  | "RATE_LIMITED"
  | "PROOF_SERVICE_UNAVAILABLE"
  | "CHAIN_UNAVAILABLE"
  | "UNKNOWN_ERROR";

export type DisclosedCredentialFields = {
  institution: string;
  degree: string;
  // Chain-disclosed fields are null whenever the proof did not succeed
  // (REVOKED or INVALID_PROOF disclose nothing at all). Anything null here is
  // listed in `withheld` instead — the two are mutually exclusive, so never
  // render a null value as if it were disclosed data.
  institutionId: string | null;
  degreeCode: number | null;
  graduationYear: number | null;
  gpa: string | number | null;
};

export type ProofDetails = {
  verified: boolean;
  issuerAuthorized: boolean;
  revoked: boolean;
  networkId: string;
  contractAddress: string;
  txId: string;
  provedAt: string;
};

export type VerificationResult = {
  status: VerificationStatus;
  disclosed: DisclosedCredentialFields;
  proof: ProofDetails;
  withheld: string[];
};

export type ApiErrorPayload = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId?: string;
  };
};

/**
 * Generic envelope for every REST call in `lib/api.ts`. Keeping one shape
 * means every screen (verify portal, dashboard) can share the same
 * loading/error UI patterns instead of inventing a new discriminated union
 * per endpoint.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: ApiErrorPayload["error"] };

export type VerifyApiResult = ApiResult<VerificationResult>;

// ---------------------------------------------------------------------------
// Dashboard: wallet
// ---------------------------------------------------------------------------

export type WalletConnection = {
  address: string;
  walletName: string;
};

// ---------------------------------------------------------------------------
// Dashboard: issued credential registry
// ---------------------------------------------------------------------------

export type CredentialListItem = {
  id: string;
  // The ISSUANCE transaction id. Named `commitmentHash` before, which is what
  // POST /credentials calls a genuinely different value — the index never
  // stores a commitment at all.
  txId: string;
  // Deliberately empty: the off-chain index never stores student identity
  // (docs/data-model.md), so the registry cannot display it.
  studentName: string;
  studentId: string;
  degree: string;
  institution: string;
  graduationYear: number;
  issuedAt: string;
  status: CredentialStatus;
};

export type ListCredentialsResult = {
  items: CredentialListItem[];
  total: number;
};

export type CredentialStatusFilter = "ALL" | CredentialStatus;

// ---------------------------------------------------------------------------
// Dashboard: issue credential
// ---------------------------------------------------------------------------

export type IssueCredentialInput = {
  studentName: string;
  studentId: string;
  degree: string;
  institution: string;
  major: string;
  graduationDate: string;
  honors: string;
  gpa: string;
};

/**
 * Fields that never leave the browser as plaintext — the backend hashes
 * these into the on-chain commitment. Everything else in
 * `IssueCredentialInput` is written to IPFS as metadata. Used to render the
 * "what goes where" callout on the issue form; keep in sync with the
 * chain-service commitment schema.
 */
export const ON_CHAIN_HASHED_FIELDS: ReadonlyArray<keyof IssueCredentialInput> =
  ["studentId", "gpa"];

export type IssuedCredential = {
  id: string;
  commitmentHash: string;
  // Always "" in this build — there is no IPFS here (see portal.py). The
  // success screen hides the field rather than rendering an empty row.
  metadataCid: string;
  txId: string;
  verifyUrl: string;
  // The backend already renders and stores a real QR PNG; it just was not
  // being displayed, leaving the issue -> certificate -> scan path unfinished.
  qrCodeUrl: string;
};

export type RevokeCredentialResult = {
  id: string;
  status: CredentialStatus;
};

// ---------------------------------------------------------------------------
// Institutions: onboarding / authorization
// ---------------------------------------------------------------------------

export type InstitutionStatus =
  | "NOT_REGISTERED"
  | "PENDING_REVIEW"
  | "AUTHORIZED"
  | "REJECTED";

export type InstitutionProfile = {
  name: string;
  website: string;
  contactEmail: string;
  country: string;
  status: InstitutionStatus;
  submittedAt?: string;
  rejectionReason?: string;
};

export type SaveInstitutionInput = {
  name: string;
  website: string;
  contactEmail: string;
  country: string;
};
