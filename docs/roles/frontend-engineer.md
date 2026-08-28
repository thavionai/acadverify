# Frontend Engineer

## Mission

Own the user-facing surfaces of AcadVerify: the university dashboard and the public verification portal where anyone can check a credential in seconds.

## Owns

- React
- Next.js (TypeScript, TailwindCSS)
- Dashboard
- Verification UI
- Wallet Integration (ethers.js / viem)

## Responsibilities

- Build and maintain the two primary surfaces in `frontend/`:
  - **University dashboard** — credential issuance form, issued-credential list with search, revoke action, QR-enabled certificate download.
  - **Public verification portal** — scan a QR or enter a credential ID and get a clear result with issuer details, blockchain status, and transaction link.
- Make verification results unambiguous: **VALID**, **REVOKED**, **TAMPERED**, and **service error** must be impossible to confuse (see the sample result in `../api-spec.md`).
- Implement the QR scanner flow and the blockchain-status display (credential exists / hash verified / issuer verified / active, plus explorer link).
- Optional direct-chain reads via ethers.js/viem for a "verify without trusting the server" mode.
- Keep the public portal fully unauthenticated; dashboard auth follows the backend's API-key model for MVP (login is a future enhancement).
- Ensure accessibility (WCAG AA) and responsive layouts — verifiers are often on low-end mobile devices; the verify page must be fast there.
- Maintain component tests and e2e tests for the critical flow: issue → download certificate → scan → verify → revoke → re-verify.

## Works on branch

`feature/frontend`

## Interfaces with other roles

- **Backend Engineer** ([backend-engineer.md](backend-engineer.md)): consumes the REST API; agrees on error semantics so the UI never renders a service error as "invalid credential."
- **Blockchain Engineer** ([blockchain-engineer.md](blockchain-engineer.md)): surfaces on-chain proof details (transaction hash, explorer links) in a way non-technical verifiers can trust.
- **Product/QA** ([product-qa.md](product-qa.md)): iterates on verification UX clarity; provides copy and edge-case flows.
- **SRE/DevOps** ([sre-devops.md](sre-devops.md)): CloudFront delivery, Docker image, error monitoring.

## Definition of done

- Critical flows are covered by e2e tests and pass in CI.
- New UI states handle loading, empty, error, and unauthorized — not just the happy path.
- Accessibility checks pass on changed screens.
- No secrets or privileged API calls in client code; the public portal works without login.
