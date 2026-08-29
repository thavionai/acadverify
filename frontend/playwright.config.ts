import { defineConfig, devices } from "@playwright/test";

/**
 * Two suites share this config:
 *  - critical-flow.spec.ts mocks the backend at the network boundary
 *    (frontend-only contract coverage, fast)
 *  - live-product.spec.ts drives the REAL stack: backend :8080 ->
 *    chain-service -> Midnight devnet. Live issuance/revocation each prove
 *    for ~25s, hence the generous timeouts.
 *
 * Start the dev server first (or let webServer reuse a running one):
 *   NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1 npm run dev
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1, // live proofs serialize through the proof server anyway
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_PUBLIC_API_BASE_URL: "http://localhost:8080/api/v1" },
  },
});
