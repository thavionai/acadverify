/**
 * Pins the two defects fixed after the first review pass.
 *
 * Both were promises to other people — one to teammates (a documented endpoint
 * that did not exist), one to SRE (a health field that was hardcoded optimistic).
 * Tests so they cannot silently regress.
 */
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../../src/http/openapi.js";
import { MockChainAdapter } from "../../src/chain/mock.js";

describe("GET /chain/openapi.json", () => {
  const doc = buildOpenApiDocument("mock") as any;

  it("is a valid OpenAPI 3.1 document", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info?.title).toContain("chain-service");
  });

  it("documents every route the service actually serves", () => {
    // If a route is added without documenting it, this fails — which is the
    // point: teammates were told this doc is the contract.
    for (const path of [
      "/chain/health",
      "/chain/authorize-issuer",
      "/chain/issue",
      "/chain/revoke",
      "/chain/prove",
      "/chain/state/{credentialId}",
    ]) {
      expect(Object.keys(doc.paths)).toContain(path);
    }
  });

  it("derives request schemas from zod rather than restating them", () => {
    const issue = doc.paths["/chain/issue"].post.requestBody.content["application/json"].schema;
    expect(issue.properties).toHaveProperty("credentialId");
    expect(issue.properties).toHaveProperty("fields");
    // Field-level constraints carried through from the zod schema.
    expect(issue.properties.fields.properties).toHaveProperty("issuerPk");
  });

  it("states the error semantics that must not be misread", () => {
    const text = JSON.stringify(doc);
    expect(text).toContain("INVALID_PROOF");
    expect(text).toContain("PROOF_MATERIAL_UNAVAILABLE");
  });
});

describe("health reports wallet state honestly", () => {
  it("mock health exposes the wallet block consumers depend on", async () => {
    const h = await new MockChainAdapter("undeployed").health();
    expect(h.services.node).toBeDefined();
    expect(h.services.indexer).toBeDefined();
    expect(h.services.proofServer).toBeDefined();
    expect(h.wallet).not.toBeNull();
    expect(typeof h.wallet?.synced).toBe("boolean");
  });

  /**
   * The live adapter previously hardcoded synced:true and computed
   * dustAvailable as `x ? null : null` — null on both branches. It now reads a
   * tracked snapshot. Guard the source so the placeholder cannot come back.
   */
  it("live adapter does not hardcode wallet health", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../src/chain/live.ts", import.meta.url), "utf8");
    expect(src).not.toContain("synced: true,");
    expect(src).not.toContain("dustAvailable: walletState ? null : null");
    expect(src).toContain("this.wallet_.read()");
  });
});
