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

export const CredentialFieldsSchema = z.object({
  studentId: hex32.describe("Opaque student identifier. NEVER a name."),
  issuerPk: hex32.describe("Issuer public key, from pureCircuits.publicKey(sk)"),
  institutionId: hex32,
  degreeCode: z.number().int().min(0).max(4_294_967_295),
  graduationYear: z.number().int().min(0).max(65_535),
  gpaTimes100: z.number().int().min(0).max(65_535).describe("GPA x100, e.g. 390 = 3.90"),
});

export const IssueRequestSchema = z.object({
  credentialId: CredentialIdSchema,
  fields: CredentialFieldsSchema,
});

export const RevokeRequestSchema = z.object({
  credentialId: CredentialIdSchema,
});

export const ProveRequestSchema = z.object({
  credentialId: CredentialIdSchema,
  /** Fields the holder consents to reveal. Empty = minimum disclosure. */
  disclose: z.array(z.enum(["gpa"])).default([]),
});

export const AuthorizeIssuerRequestSchema = z.object({
  issuerPk: hex32,
});

export type IssueRequest = z.infer<typeof IssueRequestSchema>;
export type ProveRequest = z.infer<typeof ProveRequestSchema>;
