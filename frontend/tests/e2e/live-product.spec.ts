/**
 * LIVE end-to-end product test — no backend mocking.
 *
 * Drives the real stack: Next.js UI -> FastAPI :8080 -> chain-service ->
 * local Midnight devnet, with real ZK proofs (~25s per issue/revoke).
 * The ONLY shim is the Lace wallet connector (window.midnight), since a
 * headless browser has no extension installed.
 *
 * Requires the full compose stack in CHAIN_MODE=live (or mock — the flow
 * is identical, just faster) plus scripts/bootstrap-local.sh having run.
 * The tamper/forge step needs ALLOW_DEBUG_ENDPOINTS=true on chain-service
 * and is skipped when the debug endpoint is disabled.
 */
import { test, expect } from "@playwright/test";

const ISSUER_ADDRESS = "mn_shield-addr_e2e_live1";
const CHAIN_SERVICE_URL = process.env.CHAIN_SERVICE_URL ?? "http://localhost:8090";
const STUDENT = {
  name: "Live E2E Student",
  id: `stu-e2e-${Date.now()}`,
  degree: "B.Sc. Distributed Systems",
  institution: "North Valley University",
  major: "Distributed Systems",
  graduation: "2026-06-15",
  gpa: "3.72",
};

test.describe("live credential lifecycle (real chain)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ address }) => {
        window.midnight = {
          mnLace: {
            name: "Lace",
            rdns: "io.lace",
            isEnabled: async () => true,
            enable: async () => ({ state: async () => ({ address }) }),
          },
        };
      },
      { address: ISSUER_ADDRESS },
    );
  });

  test("issue -> verify -> consent -> revoke -> re-verify -> forge", async ({ page, request }) => {
    // --- 0. Onboard the institution (the issue form is gated on an
    // AUTHORIZED institution profile) — through the real backend API. ---
    const onboard = await request.put("http://localhost:8080/api/v1/institutions/me", {
      headers: { "X-Issuer-Address": ISSUER_ADDRESS, "Content-Type": "application/json" },
      data: {
        name: STUDENT.institution,
        website: "https://nvu.example.edu",
        contactEmail: "registrar@nvu.example.edu",
        country: "US",
      },
    });
    expect(onboard.ok()).toBeTruthy();

    // --- 1. Issue through the real dashboard form (real proof, ~25s) ---
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Connect Wallet" }).click();
    await expect(page.getByText(ISSUER_ADDRESS.slice(0, 5))).toBeVisible();

    await page.getByRole("link", { name: "Issue Credentials", exact: true }).click();
    await page.getByLabel("Student Full Name").fill(STUDENT.name);
    await page.getByLabel("Student ID").fill(STUDENT.id);
    await page.getByLabel("Institution").fill(STUDENT.institution);
    await page.getByLabel("Degree Program").fill(STUDENT.degree);
    await page.getByLabel("Major").fill(STUDENT.major);
    await page.getByLabel("Graduation Date").fill(STUDENT.graduation);
    await page.getByLabel("Cumulative GPA").fill(STUDENT.gpa);

    const issueResponse = page.waitForResponse(
      (r) => r.url().includes("/api/v1/credentials") && r.request().method() === "POST",
      { timeout: 120_000 },
    );
    await page.getByRole("button", { name: "Submit & Mint Credential" }).click();
    const issued = await issueResponse;
    expect(issued.status(), "live issuance should succeed").toBe(201);
    const { id: credentialId, txId } = await issued.json();
    expect(txId, "issuance must land an on-chain tx").toBeTruthy();

    await expect(page.getByText("Credential issued")).toBeVisible({ timeout: 30_000 });

    // --- 2. Registry lists it as ACTIVE (client-side nav keeps the wallet).
    // Rows render the id via truncateMiddle(id, 6) — match the visible head. ---
    await page.getByRole("link", { name: "View in Registry" }).click();
    const row = page.locator("tr", { hasText: credentialId.slice(0, 6) }).first();
    await expect(row).toBeVisible();

    // --- 3. Public verify page (the QR destination): VALID, GPA withheld ---
    await page.goto(`/verify/${credentialId}`);
    await expect(page.getByText("Valid credential")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(STUDENT.institution)).toBeVisible();
    await expect(page.getByText(STUDENT.name)).not.toBeVisible(); // never disclosed
    await expect(page.getByText(STUDENT.gpa)).not.toBeVisible(); // withheld by default

    // --- 4. Consent to disclose GPA: same record, one more field ---
    await page.getByRole("button", { name: "GPA Disclosed" }).click();
    await expect(page.getByText(STUDENT.gpa)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(STUDENT.name)).not.toBeVisible(); // still never

    // --- 5. Revoke from the dashboard (real proof, ~25s). goto() is a full
    // reload, which drops the in-memory wallet — reconnect first. ---
    await page.goto("/dashboard/registry");
    await page.getByRole("button", { name: "Connect Wallet" }).click();
    const revokeResponse = page.waitForResponse(
      (r) => r.url().includes("/revoke") && r.request().method() === "POST",
      { timeout: 120_000 },
    );
    await row.getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("button", { name: "Confirm Revoke" }).click();
    expect((await revokeResponse).status()).toBe(200);
    await expect(row.getByText("Revoked")).toBeVisible({ timeout: 30_000 });

    // --- 6. Re-verify: REVOKED, not INVALID_PROOF and not an error ---
    await page.goto(`/verify/${credentialId}`);
    await expect(page.getByText("Revoked credential")).toBeVisible({ timeout: 60_000 });

    // --- 7. Forge: tamper the witness, proof must become impossible ---
    const tamper = await request.post(`${CHAIN_SERVICE_URL}/chain/debug/tamper/${credentialId}`);
    test.skip(tamper.status() === 404, "debug endpoints disabled; forge step skipped");
    expect(tamper.ok()).toBeTruthy();
    await page.goto(`/verify/${credentialId}`);
    // Tampered + revoked resolves to whichever the chain reports first;
    // what it must NEVER read is "Valid credential".
    await expect(page.getByText(/Invalid proof|Revoked credential/)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("Valid credential")).not.toBeVisible();
  });

  test("unknown credential id reads as not found, never as forged", async ({ page }) => {
    await page.goto("/verify/does-not-exist-000");
    await expect(
      page.getByText(/no credential|not.*found/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Invalid proof")).not.toBeVisible();
  });
});
