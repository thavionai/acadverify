# Product / QA

## Mission

Define what AcadVerify should do and prove that it does it — including the
privacy claims, which are now the product's core promise and its biggest
credibility risk.

## Owns

- Documentation (`docs/`)
- Test strategy
- Sample data (`data/`)
- Demo and presentation

## Responsibilities

### Product

- Own the credential lifecycle requirements for each stakeholder (university,
  student, employer).
- **Own the disclosure policy**: which fields are disclosed by default, which
  require consent, and how that consent is presented. This is a product
  decision with cryptographic consequences, not a UI detail.
- Keep docs current with what is actually built.
- **Police the privacy claims.** Overclaiming is the fastest way to lose
  credibility with judges who know ZK. Two specific claims to keep honest:
  - `credentialId` is disclosed on every verification, so verification is
    **not unlinkable** — the network sees which credential was checked and when.
    Never say "fully anonymous". The named remedy is in `../smart-contract.md`.
  - The MVP has the platform custodying witness data and generating proofs, so
    the verifier still trusts us not to refuse or forge. Say so, and say that
    the contract is already agnostic about who supplies the witness.
- Own the demo storyline (`../hackathon-plan.md`); rehearse at least three times
  on the machine that will be used.

### QA

- Own the test strategy: contract tests, chain-service integration tests, API
  tests, e2e.
- Maintain the critical path: issue → certificate → scan → VALID → consent to
  disclose GPA → revoke → REVOKED.
- Design adversarial cases: **wrong witness data must fail to produce a proof**
  (not return a negative result), unauthorized issuer, duplicate ID, revoked
  credential, unknown ID.
- **Test the disclosure boundary directly**: assert that `studentId` appears
  nowhere in any API response, log line, or on-chain transcript, and that
  `revealGpa: false` yields no GPA.
- Verify failure modes are honest: a proof-server outage must render as a
  service error, never as an invalid credential. Test this by actually stopping
  the proof server.
- Maintain `data/`: demo university, sample graduates, and one credential with
  **deliberately wrong witness data** for the forgery demo.
- Triage by trust impact: a false `VALID`, or any leak of credential fields or
  salts, is P0 always.

## Branch

`<yourname>-docs`

## Plugin skills

`midnight-fact-check:*` — run the pitch and README claims through it before
submitting. `core-concepts:zero-knowledge`, `core-concepts:privacy-patterns` for
describing the system accurately.

## Interfaces

All roles. Particularly **Blockchain** and **Chain-service** on what the system
does and does not reveal.

## Definition of done

- Every feature has written acceptance criteria before implementation.
- Release sign-off includes the critical path and the adversarial checklist.
- A false `VALID`, or a leaked field/salt, is P0 in triage — always.
- Every privacy claim in the README, pitch, and Devpost submission has been
  checked against what the contract actually does.
