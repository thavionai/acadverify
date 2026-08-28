/**
 * The error taxonomy, and the single most important rule in this service:
 *
 *   INVALID_PROOF  =>  the CREDENTIAL failed. A statement about the credential.
 *   5xx            =>  WE failed. A statement about our infrastructure.
 *
 * Collapsing those two accuses a real graduate of forgery because a container
 * ran out of memory. docs/api-spec.md calls this out explicitly; it is enforced
 * here by giving the service-failure cases their own codes and never letting a
 * thrown infrastructure error fall through to a credential verdict.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "ISSUER_NOT_AUTHORIZED"
  | "NOT_FOUND"
  | "DUPLICATE_CREDENTIAL"
  | "CREDENTIAL_ALREADY_REVOKED"
  | "RATE_LIMITED"
  | "PROOF_SERVICE_UNAVAILABLE"
  | "PROOF_MATERIAL_UNAVAILABLE"
  | "CHAIN_UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  ISSUER_NOT_AUTHORIZED: 403,
  NOT_FOUND: 404,
  DUPLICATE_CREDENTIAL: 409,
  CREDENTIAL_ALREADY_REVOKED: 409,
  RATE_LIMITED: 429,
  PROOF_SERVICE_UNAVAILABLE: 503,
  PROOF_MATERIAL_UNAVAILABLE: 503,
  CHAIN_UNAVAILABLE: 503,
  NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

/**
 * User-facing wording. The public verify portal renders these, so a 503 must
 * never leave a graduate thinking their degree was rejected.
 */
const MESSAGES: Partial<Record<ErrorCode, string>> = {
  PROOF_SERVICE_UNAVAILABLE:
    "Could not generate a proof right now. This is a problem on our side, not a problem with the credential.",
  PROOF_MATERIAL_UNAVAILABLE:
    "We cannot currently produce a proof for this credential because our proving material is unavailable. This is a problem on our side, not a problem with the credential.",
  CHAIN_UNAVAILABLE:
    "Could not reach the Midnight network. This is a problem on our side, not a problem with the credential.",
  NOT_CONFIGURED: "The chain-service is not fully configured yet.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? MESSAGES[code] ?? code);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  static notFound(what = "Credential not found.") {
    return new AppError("NOT_FOUND", what);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
