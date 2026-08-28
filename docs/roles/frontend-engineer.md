# Frontend Engineer

## Mission

Own the user-facing surfaces: the university dashboard and the public
verification portal — and make selective disclosure legible to a non-technical
verifier.

## Owns

- Next.js (TypeScript, TailwindCSS), React
- Dashboard + public verification portal
- QR scanning
- Wallet integration via `@midnight-ntwrk/dapp-connector-api` *(stretch)*

## Responsibilities

- Build the two surfaces in `frontend/`:
  - **Dashboard** — issue form, credential list with search, revoke, certificate
    download.
  - **Public verify portal** — scan a QR or enter an ID, get a clear result.
- Make the four states impossible to confuse: **VALID**, **REVOKED**,
  **INVALID_PROOF**, **service error**. A service error must never look like a
  rejected credential — that failure mode accuses a real graduate of fraud
  because our infrastructure hiccuped.
- **Show what was withheld.** Render the `disclosed` fields *and* the `withheld`
  list side by side. Selective disclosure is invisible if the UI only shows what
  was revealed — and being able to point at the withheld list is the single most
  persuasive thing on screen during judging.
- Build the consent flow: the student chooses whether GPA is disclosed, and the
  UI shows the same credential verifying two ways.
- **No ethers.js/viem, no explorer links** — there is no EVM and no PolygonScan.
  Where the old design linked to a block explorer, show `contractAddress`,
  `txId`, `networkId`, and a copyable indexer GraphQL query anyone can run
  themselves.
- Communicate proof latency honestly: verification generates a ZK proof and is
  not instant. Design a real loading state; do not let it read as a hang.
- *(Stretch)* Lace wallet connection. Enumerate `Object.values(window.midnight)`
  and match on `name`/`rdns` — relying on `window.midnight.mnLace` alone misses
  other wallets.
- Accessibility (WCAG AA) and mobile performance — verifiers are often on
  low-end phones.

## Branch

`<yourname>-frontend`

## Plugin skills

`midnight-dapp-dev:dapp-connector`, `midnight-dapp-dev:init`,
`midnight-cq:dapp-connector-testing`

## Interfaces

- **Backend** ([backend-engineer.md](backend-engineer.md)): REST API and error
  semantics.
- **Chain-service** ([chain-service-engineer.md](chain-service-engineer.md)):
  *(stretch)* client-side proving via Lace.
- **Product/QA** ([product-qa.md](product-qa.md)): disclosure UX and copy.

## Definition of done

- Critical flows covered by e2e tests: issue → certificate → scan → verify →
  consent-to-disclose → revoke → re-verify.
- Every state handles loading, empty, error, and unauthorized.
- The verify page renders disclosed **and** withheld fields.
- Accessibility checks pass on changed screens.
- No secrets or witness data in client code.
