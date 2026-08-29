/**
 * OpenAPI document served at GET /chain/openapi.json.
 *
 * Generated FROM the zod request schemas rather than hand-written, so it cannot
 * drift from what the service actually validates — a schema doc that disagrees
 * with the code is worse than none, because consumers trust it.
 */
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AuthorizeIssuerRequestSchema,
  IssueRequestSchema,
  ProveRequestSchema,
  RevokeRequestSchema,
} from "./schemas.js";

const json = (schema: Parameters<typeof zodToJsonSchema>[0]) =>
  zodToJsonSchema(schema, { $refStrategy: "none" });

const errorResponse = {
  description: "Error envelope",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" },
            },
          },
        },
      },
    },
  },
};

const body = (schema: unknown) => ({
  required: true,
  content: { "application/json": { schema } },
});

export function buildOpenApiDocument(mode: "mock" | "live") {
  return {
    openapi: "3.1.0",
    info: {
      title: "AcadVerify chain-service",
      version: "0.1.0",
      description:
        "Midnight sidecar. FastAPI reaches Midnight only through this service — " +
        "Midnight.js is TypeScript-only.\n\n" +
        "Error semantics: INVALID_PROOF is a statement about the CREDENTIAL; " +
        "any 5xx is a statement about OUR infrastructure. Never render a 5xx as " +
        "an invalid credential. 503 PROOF_MATERIAL_UNAVAILABLE in particular " +
        "means our witness vault is missing and says nothing about the credential.\n\n" +
        "Verification does NOT submit a transaction: the disclosed claim is the " +
        "circuit's public output, so publishing it would publish the disclosure. " +
        "`proof.issuanceTxId` refers to ISSUANCE.",
    },
    servers: [{ url: "/", description: `chain-service (${mode} mode)` }],
    paths: {
      "/chain/health": {
        get: {
          summary: "Node, indexer, and proof server reported separately",
          responses: { "200": { description: "Health snapshot" }, "503": errorResponse },
        },
      },
      "/chain/authorize-issuer": {
        post: {
          summary: "Authorize a university's issuer key on-chain",
          requestBody: body(json(AuthorizeIssuerRequestSchema)),
          responses: { "200": { description: "Submitted" }, "503": errorResponse },
        },
      },
      "/chain/issue": {
        post: {
          summary: "Issue a credential (writes a blinded commitment on-chain)",
          description:
            "Synchronous and proof-bound — measured ~19s. Call from a background " +
            "task and poll; do not block a request on it.",
          requestBody: body(json(IssueRequestSchema)),
          responses: {
            "201": { description: "Issued" },
            "409": errorResponse,
            "503": errorResponse,
          },
        },
      },
      "/chain/revoke": {
        post: {
          summary: "Revoke a credential (irreversible)",
          requestBody: body(json(RevokeRequestSchema)),
          responses: {
            "200": { description: "Revoked" },
            "404": errorResponse,
            "409": errorResponse,
          },
        },
      },
      "/chain/prove": {
        post: {
          summary: "Verify a credential, disclosing only consented fields",
          description:
            "A non-VALID status is still HTTP 200 — the request succeeded, the " +
            "credential simply did not verify. `disclosed.gpaTimes100` is null " +
            "when withheld, never 0, so a real 0.00 GPA stays distinguishable.",
          requestBody: body(json(ProveRequestSchema)),
          responses: {
            "200": { description: "VALID | REVOKED | INVALID_PROOF" },
            "404": errorResponse,
            "503": errorResponse,
          },
        },
      },
      "/chain/state/{credentialId}": {
        get: {
          summary: "Cheap indexer read: exists / revoked. No proving, no vault.",
          parameters: [
            {
              name: "credentialId",
              in: "path",
              required: true,
              schema: { type: "string" },
              example: "ACAD-2026-000001",
            },
          ],
          responses: { "200": { description: "State" }, "404": errorResponse },
        },
      },
    },
  };
}
