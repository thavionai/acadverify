# AcadVerify — Hackathon Plan

## The event

**MLH Midnight Virtual Hackathon** — Aug 28–30, 2026 · [event page](https://events.mlh.com/events/14510-midnight-hackathon-august)

- Track: **Integrate Midnight** (stretch: Cross-Chain) — see `midnight-integration.md` for the integration architecture and the deadline-driven 48-hour plan.
- Submissions via **Devpost**: initial due **Sunday 10:00 AM ET**, final due **Sunday 11:45 AM ET**.
- Prize: $125 digital gift card per winning team member across four tracks.

## Project Status

🚧 **Hackathon MVP** — under active development as part of a blockchain hackathon. The goal is a complete end-to-end decentralized academic credential verification platform demonstrating blockchain, cloud-native architecture, DevOps practices, and secure credential management.

## Pitch (30 seconds)

Fake degrees are a global problem, and verifying a real one takes weeks of emails — or worse, means handing over your whole transcript. AcadVerify lets a university issue credentials on **Midnight**, so an employer can verify in five seconds from a QR code that a degree is valid, non-revoked, and from an authorized issuer — **via a zero-knowledge proof that reveals only what the student consents to share**. Not even hashes of personal data touch the chain.

## Development Roadmap

### Phase 1 — Repository Setup

- [ ] Create repository
- [ ] Setup project structure
- [ ] Configure branching strategy

### Phase 2 — Blockchain (Midnight)

- [ ] Compact contract (`academic_credential.compact`) — see `midnight-integration.md`
- [ ] Unit tests on local devnet
- [ ] Midnight testnet deployment (tDUST funded)
- [ ] (Stretch, Cross-Chain track) `AcademicCredential.sol` public anchor on Polygon Amoy

### Phase 3 — Backend

- [ ] REST APIs (FastAPI)
- [ ] Chain-service sidecar (Node/TS + MidnightJS) — FastAPI calls it over HTTP
- [ ] QR generation
- [ ] Commitment/hash generation

### Phase 4 — Frontend

- [ ] University dashboard
- [ ] Credential issuance
- [ ] Verification page
- [ ] QR scanning

### Phase 5 — Cloud Deployment

- [ ] Docker
- [ ] AWS Infrastructure (Terraform)
- [ ] GitHub Actions
- [ ] ECS Deployment

## Demo storyline (what the judges see)

1. **Issue** — University admin opens the dashboard, fills the credential form, clicks Issue. Hash goes on-chain (show the explorer link).
2. **Certificate** — Download the QR-enabled certificate; the student "receives" it.
3. **Verify** — Judge scans the QR on their own phone → big green **VERIFIED** with issuer identity and transaction hash.
4. **Revoke** — Admin revokes that credential live. Judge refreshes → **REVOKED**. This is the money shot: revocation is on-chain and instant to check.
5. **Tamper** — Verify a doctored credential → **TAMPERED** (hash mismatch).

Keep the demo on the public testnet, not a local node — the block-explorer link is what makes it credible.

## Team workstreams

Roles as defined in `docs/roles/`; one person can wear two hats. Each role works on its own `feature/*` branch (see README branch strategy).

| Workstream | Owner (role) | Branch |
|---|---|---|
| Smart contract, Hardhat tests, testnet deploy | [Blockchain Engineer](roles/blockchain-engineer.md) | `feature/blockchain` |
| FastAPI, Web3.py integration, hashing, QR | [Backend Engineer](roles/backend-engineer.md) | `feature/backend` |
| Dashboard, verification portal, QR scanner | [Frontend Engineer](roles/frontend-engineer.md) | `feature/frontend` |
| Terraform, Docker, GitHub Actions, ECS, monitoring | [SRE / DevOps](roles/sre-devops.md) | `feature/devops` |
| Docs, testing, sample data, demo, presentation | [Product / QA](roles/product-qa.md) | `feature/docs` |

## Scope guardrails

### Must have (demo-critical)

- Contract on testnet with issue / verify / revoke / duplicate-prevention / issuer restriction
- Issuance API with SHA256 hashing and on-chain write
- Public verify endpoint + portal with the four unambiguous states (VALID / REVOKED / TAMPERED / service error)
- Dashboard: issue form, credential list, revoke button
- QR-enabled certificate download + QR scan verification
- Seed script: one demo university, sample graduates (in `data/`)

### Explicitly out of scope for the hackathon

University login (API key instead), mainnet, institution-held keys, real KYC onboarding — designed in docs, not built.

## Future Enhancements

- DID (Decentralized Identity)
- Verifiable Credentials (W3C)
- NFT Certificates
- Multi-University Support
- Student Wallet
- Employer Portal
- Zero Knowledge Proofs
- IPFS Metadata Storage
- AI Fraud Detection
- Mobile Application
- Multi-chain Support
- Institutional Admin Portal
- Analytics Dashboard
- Bulk Certificate Issuance

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Testnet congestion / faucet dry during demo | Pre-fund wallets day 1; pre-issue the demo credential; record a backup video |
| Venue network blocks RPC | Mobile hotspot backup; verify reads can fall back to cached chain state |
| Live revoke transaction slow on stage | Revoke a pre-planned credential 2 min before that demo step; narrate while it confirms |
| Scope creep | Anything not on the must-have list needs unanimous team agreement to start |

## Judging criteria mapping

- **Innovation**: trustless verification — judges verify on-chain themselves, not via our word.
- **Technical depth**: on-chain hash integrity + revocation, authorized issuer wallets, PII-free chain design, full AWS/Terraform/CI-CD story.
- **Impact**: credential fraud + weeks-long verification turnaround, quantified in the pitch.
- **Completeness**: full lifecycle demo — issue, receive, verify, revoke, tamper-detect.
