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
  | "GRANT_NOT_FOUND"
  | "AI_UNAVAILABLE"
  | "UNKNOWN_ERROR";

export type DisclosedCredentialFields = {
  // Nullable like the rest. These two are read from the off-chain index
  // rather than the circuit, and used to stay populated on a failed proof —
  // so a REVOKED credential showed "Institution / Degree" under *Disclosed
  // Fields* while the proof had disclosed nothing. The API now clears them
  // unless the proof succeeded.
  institution: string | null;
  degree: string | null;
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
  // null on a failed proof: the circuit does not report which assert failed.
  issuerAuthorized: boolean | null;
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
  // The network the wallet is actually on. Worth carrying: the wallet may be
  // on mainnet while this build's contract lives on a local devnet, and the UI
  // should be able to say so rather than imply they are the same chain.
  networkId?: string;
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
  // Optional. Used once to send the access link, then dropped — the server
  // stores no student identity, so there is no resend.
  studentEmail?: string;
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
  // The graduate's own access link. Returned exactly once, at issuance — the
  // server stores only a hash and cannot produce it again.
  holdUrl: string;
  // Three states, not two: null means no address was given, false means one
  // was and the send failed — in which case holdUrl above is the only copy.
  emailSent?: boolean | null;
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


// ---------------------------------------------------------------------------
// Holder portal — the graduate's own view of their credential
// ---------------------------------------------------------------------------

/** A share link the holder minted for one verifier. */
export type ShareGrant = {
  grantId: string;
  revealGpa: boolean;
  createdAt: string;
  revoked: boolean;
  verifyUrl: string;
};

export type HolderCredential = {
  id: string;
  // Null whenever the proof did not succeed — the same rule the public page
  // follows. A credential that cannot be proven discloses nothing, including
  // to the person holding it.
  institution: string | null;
  degree: string | null;
  graduationYear: number | null;
  gpa: number | null;
  status: VerificationStatus;
  issuedAt: string;
  verifyUrl: string;
};

export type HolderPortalData = {
  credential: HolderCredential;
  grants: ShareGrant[];
};

// ---------------------------------------------------------------------------
// Resume checker
// ---------------------------------------------------------------------------

/** proven: the credential backs it. contradicted: the credential says
 *  otherwise. unproven: this credential simply cannot speak to it — which is
 *  not an accusation. */
export type ClaimVerdict = "proven" | "unproven" | "contradicted";

export type ResumeClaim = {
  type: "degree" | "institution" | "graduationYear" | "gpa" | "other";
  text: string;
  value: string;
  verdict: ClaimVerdict;
  reason: string;
};

export type ResumeCheckResult = {
  claims: ResumeClaim[];
  summary: Record<ClaimVerdict, number>;
  checkedAt: string;
};
