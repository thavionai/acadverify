# Product / QA

## Mission

Define what AcadVerify should do and prove that it does it: requirements for the credential lifecycle, trust and UX standards for verification, the test strategy, and the hackathon demo itself.

## Owns

- Documentation (`docs/`)
- Testing
- Sample Data (`data/`)
- Demo
- Presentation

## Responsibilities

### Product

- Own the credential lifecycle requirements: issuance, certificate delivery, verification, and revocation — for each stakeholder (university, student, employer/verifier).
- Write clear acceptance criteria for every feature; ambiguity in a verification product becomes a trust bug.
- Own the docs set (`architecture.md`, `api-spec.md`, and this folder) and keep it current with what's actually built.
- Track compliance constraints: no PII on-chain, consent for what a QR exposes, erasure implications (see `../data-model.md`).
- Own the hackathon demo storyline and presentation (see `../hackathon-plan.md`); rehearse the full flow at least three times before judging.

### QA

- Own the test strategy across layers: contract tests (with the blockchain engineer), API integration tests, and end-to-end flows.
- Maintain the critical-path e2e suite: issue → certificate → scan QR → VALID → revoke → REVOKED must pass on every release.
- Design adversarial test cases: tampered documents (TAMPERED), forged issuer wallets, duplicate credential IDs, revoked-then-reshared certificates, unknown IDs.
- Verify failure modes are honest: a service outage must never render as "invalid credential," and vice versa.
- Manage sample data in `data/`: demo university, sample graduates, pre-issued testnet credentials, one deliberately tampered certificate for the demo.
- Run release verification on staging against testnet before promotion; sign-off is required for production releases.
- Triage bugs with severity tied to trust impact — anything that could show a false "VALID" is a stop-ship P0, always.

## Works on branch

`feature/docs`

## Interfaces with other roles

- **Blockchain Engineer** ([blockchain-engineer.md](blockchain-engineer.md)): revocation semantics, testnet demo scenarios.
- **Backend Engineer** ([backend-engineer.md](backend-engineer.md)): acceptance criteria for APIs, fixtures, error-state contracts.
- **Frontend Engineer** ([frontend-engineer.md](frontend-engineer.md)): verification UX clarity, copy, edge-case states.
- **SRE/DevOps** ([sre-devops.md](sre-devops.md)): release gates, staging environment, rollback decisions.

## Definition of done

- Every feature has written acceptance criteria before implementation starts.
- Release sign-off includes the critical-path e2e suite and the adversarial checklist.
- A false "VALID" (shown for a tampered or revoked credential) is a P0 in triage, always.
- Requirement changes are reflected in the test suite and docs in the same cycle.
