# Blockchain Engineer (Compact / Midnight)

## Mission

Own the on-chain layer: `academic_credential.compact`, its circuits, and the
privacy guarantees the whole product rests on.

## Owns

- **Compact contract** — `midnight/contracts/academic_credential.compact`
- Circuit design, disclosure boundaries, commitment scheme
- Contract tests (happy path + adversarial)
- Deployment to local devnet and **`preview`**
- The compiled handoff to the chain-service: `contract/`, `keys/`, `zkir/`
- *(Cross-Chain stretch only)* the Solidity anchor

## Responsibilities

- Maintain the four circuits — `authorizeIssuer`, `issue`, `revokeCredential`,
  `proveCredential` — per `../smart-contract.md`.
- **Own the disclosure boundary.** Every `disclose()` in the contract is a
  deliberate decision that something becomes public. Review each one as a
  privacy change, not a syntax fix.
- Keep credential fields in witnesses. **No personal data, and no hash of
  personal data, on the ledger** — only blinded commitments.
- Own domain separation: every hash carries its own prefix (e.g.
  `"acadverify:pk:"`) so values from different contexts can never collide or
  become linkable.
- Write tests including the case that matters most: **wrong witness data must
  fail to produce a proof**, not return a negative result.
- Deploy via the chain-service (`deployContract`), never manually. Commit
  addresses to `midnight/deployments/<networkId>.json`.
- Track proof generation cost per circuit — it is the product's latency budget.
- Keep `compiler/contract-info.json` committed and reviewed: it is the
  machine-checkable statement of what each circuit can reveal.

## Branch

`<yourname>-blockchain`

## Plugin skills

`compact-core:*` (ledger, structure, privacy-disclosure, security, patterns),
`compact-examples:code-examples`, `midnight-verify:*`,
`midnight-cq:compact-testing`, `midnight-status-codes:*`

## Interfaces

- **Chain-service** ([chain-service-engineer.md](chain-service-engineer.md)):
  hands over the compiled `contract/` API, `keys/`, and `zkir/`; jointly owns the
  witness shape.
- **Backend** ([backend-engineer.md](backend-engineer.md)): agrees the
  `credentialId` encoding.
- **Product/QA** ([product-qa.md](product-qa.md)): adversarial scenarios.

## Definition of done

- `compact compile` succeeds and the circuit count is unchanged (or the change
  is intentional and reviewed).
- Tests cover happy path, revocation, duplicate, unauthorized issuer, and
  wrong-witness-cannot-prove.
- Any change to a circuit's arguments or result type is called out explicitly in
  the PR — that is a change to what the system can reveal.
- No new `disclose()` without a written justification.
