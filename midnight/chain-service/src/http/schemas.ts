/** Request/response schemas. Shared by mock and live — this is the frozen contract. */
import { z } from "zod";

const hex32 = z
  .string()
  .regex(/^(0x)?[0-9a-fA-F]{64}$/, "must be 64 hex characters (32 bytes)")
  .transform((s) => (s.startsWith("0x") ? s.slice(2) : s).toLowerCase());

export const CredentialIdSchema = z
  .string()
  .min(1)
  .max(128)
  .describe("Human credential identifier, e.g. ACAD-2026-000123");

/**
 * An issuer's identity, as the caller knows it — in practice the connected
 * wallet address. chain-service DERIVES that institution's signing key from
 * this, so two different institutions can never share one on-chain issuer.
 */
export const InstitutionIdSchema = z
  .string()
  .min(1)
  .max(256)
  .describe("Issuer identity, e.g. the institution's wallet address");

export const CredentialFieldsSchema = z.object({
  studentId: hex32.describe("Opaque student identifier. NEVER a name."),
  // issuerPk is deliberately NOT accepted from the caller. The circuit asserts
  // fields.issuerPk == publicKey(localSecretKey()), so a caller-supplied value
  // is either redundant or a lie; chain-service fills it from the key it is
  // about to sign with. Previously the backend sent a single global ISSUER_PK
  // for every university, which is why every credential on the ledger shared
  // one issuer.
  institutionId: hex32.describe("Awarding institution digest — a disclosed field, not the signer"),
  degreeCode: z.number().int().min(0).max(4_294_967_295),
  graduationYear: z.number().int().min(0).max(65_535),
  gpaTimes100: z.number().int().min(0).max(65_535).describe("GPA x100, e.g. 390 = 3.90"),
});

export const IssueRequestSchema = z.object({
  credentialId: CredentialIdSchema,
  institutionId: InstitutionIdSchema,
  fields: CredentialFieldsSchema,
});

export const RevokeRequestSchema = z.object({
  credentialId: CredentialIdSchema,
  // The circuit binds revocation to the credential's ACTUAL issuer, so the
  // caller's identity decides which key signs. A university that did not issue
  // this credential cannot revoke it.
  institutionId: InstitutionIdSchema,
});

export const ProveRequestSchema = z.object({
  credentialId: CredentialIdSchema,
  /** Fields the holder consents to reveal. Empty = minimum disclosure. */
  disclose: z.array(z.enum(["gpa"])).default([]),
});

export const AuthorizeIssuerRequestSchema = z.object({
  // Either name the institution and let chain-service derive its key (the
  // normal path), or pass a raw public key directly (the operator script,
  // which authorises a key it holds elsewhere).
  institutionId: InstitutionIdSchema.optional(),
  issuerPk: hex32.optional(),
}).refine((v) => v.institutionId || v.issuerPk, {
  message: "one of institutionId or issuerPk is required",
});

export type IssueRequest = z.infer<typeof IssueRequestSchema>;
export type ProveRequest = z.infer<typeof ProveRequestSchema>;
