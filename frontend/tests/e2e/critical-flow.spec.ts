/**
 * Scaffold for the Definition of Done's critical-path coverage:
 *   issue -> student link -> holder grants GPA -> verify -> revoke -> re-verify
 *
 * This repo checkout doesn't include package.json / a Playwright config, so
 * this file isn't wired into a runner yet. Once `@playwright/test` is added
 * to the real project and a `playwright.config.ts` points `baseURL` at the
 * dev server, this spec can run as-is. It mocks the backend at the network
 * boundary (`page.route`) so it exercises real frontend code without
 * depending on a live chain-service/proof server.
 */
import { test, expect } from "@playwright/test";

const CREDENTIAL_ID = "cred_test123";
const HOLDER_TOKEN = "holder-token-e2e";
const GRANT_ID = "grant-e2e";
const ISSUER_ADDRESS = "mn_shield-addr_test1xyz";

const BASE_CREDENTIAL = {
  id: CREDENTIAL_ID,
  commitmentHash: "0xabc123",
  studentName: "Ama Serwaa",
  studentId: "UG-2024-0001",
  degree: "B.Sc. Computer Science",
  institution: "University of Ghana",
  graduationYear: 2024,
  issuedAt: new Date().toISOString(),
  status: "ACTIVE" as const,
};

function verificationPayload(status: "VALID" | "REVOKED" | "INVALID_PROOF", discloseGpa: boolean) {
  return {
    status,
    disclosed: {
      institution: "University of Ghana",
      institutionId: "UG",
      degree: "B.Sc. Computer Science",
      degreeCode: 101,
      graduationYear: 2024,
      gpa: discloseGpa ? 3.85 : null,
    },
    proof: {
      verified: status === "VALID",
      issuerAuthorized: true,
      revoked: status === "REVOKED",
      networkId: "midnight-testnet",
      contractAddress: "0xcontract",
      txId: "0xtx",
      provedAt: new Date().toISOString(),
    },
    withheld: discloseGpa ? [] : ["gpa", "studentId"],
  };
}

test.describe("critical credential lifecycle", () => {
  test("issue, verify, consent toggle, revoke, re-verify", async ({ page }) => {
    let issued = false;
    let revoked = false;

    // Stub the Midnight wallet connector so the dashboard sees a connected
    // issuer without a real browser extension installed.
    await page.addInitScript(
      ({ address }) => {
        // Mirrors the real Lace connector (apiVersion 4.0.1): a UUID key, a
        // connect(networkId) that rejects a mismatched network, and addresses
        // read from getShieldedAddresses(). The previous stub used an
        // isEnabled/enable/state shape that no wallet implements, so these
        // tests passed while real wallet connect was broken.
        window.midnight = {
          "4ecdca0b-ffef-4d9e-87f8-f5c04e9cd72f": {
            name: "lace",
            rdns: "io.lace",
            apiVersion: "4.0.1",
            connect: async (networkId: string) => {
              if (networkId !== "undeployed") {
                throw new Error("Network ID mismatch");
              }
              return {
                getShieldedAddresses: async () => ({ shieldedAddress: address }),
              };
            },
          },
        };
      },
      { address: ISSUER_ADDRESS },
    );

    await page.route("**/api/v1/institutions/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name: "University of Ghana",
          website: "https://www.ug.edu.gh",
          contactEmail: "registrar@ug.edu.gh",
          country: "Ghana",
          status: "AUTHORIZED",
        }),
      }),
    );

    // Regex, not a glob: the registry appends ?status=/&search= query params
    // and "**/api/v1/credentials" would let those requests through to a real
    // backend if one is running.
    await page.route(/\/api\/v1\/credentials(\?.*)?$/, async (route) => {
      if (route.request().method() === "POST") {
        issued = true;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: CREDENTIAL_ID,
            commitmentHash: "0xabc123",
            metadataCid: "bafy...",
            txId: "0xtx",
            verifyUrl: `https://acadverify.example/verify/${CREDENTIAL_ID}`,
            qrCodeUrl: "https://assets.example/qr.png",
            holdUrl: `https://acadverify.example/hold/${HOLDER_TOKEN}`,
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: issued ? [{ ...BASE_CREDENTIAL, status: revoked ? "REVOKED" : "ACTIVE" }] : [],
          total: issued ? 1 : 0,
        }),
      });
    });

    // The holder portal: one credential, and grants the student creates.
    let grantCreated = false;
    await page.route("**/api/v1/hold/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          credential: {
            id: CREDENTIAL_ID,
            institution: BASE_CREDENTIAL.institution,
            degree: BASE_CREDENTIAL.degree,
            graduationYear: 2026,
            gpa: 3.85,
            status: "VALID",
            issuedAt: "2026-06-15T00:00:00Z",
            verifyUrl: `https://acadverify.example/verify/${CREDENTIAL_ID}`,
          },
          grants: grantCreated
            ? [
                {
                  grantId: GRANT_ID,
                  revealGpa: true,
                  createdAt: "2026-06-15T00:00:00Z",
                  revoked: false,
                  verifyUrl: `/verify/${CREDENTIAL_ID}?grant=${GRANT_ID}`,
                },
              ]
            : [],
        }),
      }),
    );

    await page.route("**/api/v1/hold/grants", (route) => {
      grantCreated = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          grantId: GRANT_ID,
          revealGpa: true,
          createdAt: "2026-06-15T00:00:00Z",
          revoked: false,
          verifyUrl: `/verify/${CREDENTIAL_ID}?grant=${GRANT_ID}`,
        }),
      });
    });

    await page.route(`**/api/v1/credentials/${CREDENTIAL_ID}/certificate`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: Buffer.from("%PDF-1.4 test"),
      }),
    );

    await page.route(`**/api/v1/credentials/${CREDENTIAL_ID}/revoke`, (route) => {
      revoked = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: CREDENTIAL_ID, status: "REVOKED" }),
      });
    });

    await page.route(`**/api/v1/verify/${CREDENTIAL_ID}*`, (route) => {
      const url = new URL(route.request().url());
      // The GPA is disclosed only when the holder's grant is presented.
      // `disclose=gpa` must have no effect at all.
      const discloseGpa = url.searchParams.get("grant") === GRANT_ID;
      const status = revoked ? "REVOKED" : "VALID";

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(verificationPayload(status, discloseGpa)),
      });
    });

    // 1. Issue
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Connect Wallet" }).click();
    await expect(page.getByText(ISSUER_ADDRESS.slice(0, 5))).toBeVisible();

    // Both the sidebar and the overview card link here — either is fine.
    await page.getByRole("link", { name: "Issue Credentials", exact: true }).click();
    await page.getByLabel("Student Full Name").fill(BASE_CREDENTIAL.studentName);
    await page.getByLabel("Student ID").fill(BASE_CREDENTIAL.studentId);
    await page.getByLabel("Institution").fill(BASE_CREDENTIAL.institution);
    await page.getByLabel("Degree Program").fill(BASE_CREDENTIAL.degree);
    await page.getByLabel("Major").fill("Computer Science");
    await page.getByLabel("Graduation Date").fill("2024-06-01");
    await page.getByLabel("Cumulative GPA").fill("3.85");
    await page.getByRole("button", { name: "Submit & Mint Credential" }).click();

    await expect(page.getByText("Credential issued")).toBeVisible();

    // 2. Certificate download (from the success panel's registry link)
    await page.getByRole("link", { name: "View in Registry" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download certificate" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("certificate");

    // 3 & 4. Scan/verify: navigate directly as the QR flow would.
    await page.goto(`/verify/${CREDENTIAL_ID}`);
    await expect(page.getByText("Valid credential")).toBeVisible();
    // "Student Id" the LABEL is supposed to be visible — in the Withheld
    // panel, which is the product surface for selective disclosure. What
    // must never appear is the student's actual data.
    await expect(page.getByText(BASE_CREDENTIAL.studentName)).not.toBeVisible();
    await expect(page.getByText(BASE_CREDENTIAL.studentId)).not.toBeVisible();

    // 5. A verifier cannot ask for more. The toggle that used to let anyone
    // reveal the GPA is gone, and the query parameter it used is now inert.
    await expect(page.getByRole("button", { name: "GPA Disclosed" })).toHaveCount(0);
    await page.goto(`/verify/${CREDENTIAL_ID}?disclose=gpa`);
    await expect(page.getByText("3.85")).toHaveCount(0);

    // 6. Only the graduate can widen it. From their own access link they mint
    // a share link that includes the GPA, and that link discloses it.
    await page.goto(`/hold/${HOLDER_TOKEN}`);
    await page.getByRole("button", { name: "Share including GPA" }).click();
    await expect(page.getByText(`grant=${GRANT_ID}`)).toBeVisible();

    await page.goto(`/verify/${CREDENTIAL_ID}?grant=${GRANT_ID}`);
    await expect(page.getByText("3.85")).toBeVisible();

    // 7. Revoke from the dashboard. goto() is a full page load, which drops
    // the in-memory wallet connection — reconnect before acting.
    await page.goto("/dashboard/registry");
    await page.getByRole("button", { name: "Connect Wallet" }).click();
    await page.getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("button", { name: "Confirm Revoke" }).click();
    // Scoped to the table: "Revoked" also appears in the status filter
    // dropdown and the modal copy.
    await expect(page.getByRole("table").getByText("Revoked", { exact: true })).toBeVisible();

    // 7. Re-verify: the same public page must now read REVOKED, not
    // INVALID_PROOF or a generic error - a revoked credential is not the
    // same failure mode as a broken proof.
    await page.goto(`/verify/${CREDENTIAL_ID}`);
    await expect(page.getByText("Revoked credential")).toBeVisible();
  });

  test("service error never reads as a rejected credential", async ({ page }) => {
    await page.route(`**/api/v1/verify/${CREDENTIAL_ID}*`, (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
    );

    await page.goto(`/verify/${CREDENTIAL_ID}`);

    await expect(page.getByText("Service error")).toBeVisible();
    // A 503 maps to PROOF_SERVICE_UNAVAILABLE ("not a problem with the
    // credential"); other failures say "not a rejection of the credential".
    // Either way the copy must blame the service, never the credential.
    await expect(
      page.getByText(/not a (rejection of|problem with) the credential/i),
    ).toBeVisible();
    await expect(page.getByText("Invalid proof")).not.toBeVisible();
    await expect(page.getByText("Revoked credential")).not.toBeVisible();
  });
});
