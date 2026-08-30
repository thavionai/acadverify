# AcadVerify — API Specification

Two services. **FastAPI** owns REST, metadata, QR, and storage. The **chain-service**
(Node/TS) owns everything requiring a proof, because Midnight.js is TypeScript-only
and Web3.py cannot reach Midnight.

Base URL: `/api/v1` · JSON · Swagger at `/docs`.
Versions/endpoints: `midnight-stack.md`. Verification semantics: `smart-contract.md`.

## Conventions

- Timestamps are ISO 8601 UTC.
- `credentialId` is the public identifier, embedded in the QR code.
- `txId` is a **Midnight transaction identifier** — not an EVM `0x` tx hash.
- Issuers are identified by `issuerPk` (`Bytes<32>` hex), **never a wallet address**.
- List endpoints support `?page=` and `?limit=` (default 20, max 100).

---

## Public endpoints (no auth)

### `GET /verify/{credentialId}`

Verify a credential. Default disclosure is minimal.

`?grant={grantId}` presents a **share link minted by the credential holder**.
The GPA is disclosed only when a live grant for that credential says so — a
verifier has no way to ask for it, because asking was never consent.

`?disclose=gpa` is still accepted and **does nothing**. It was a public query
parameter that let any visitor reveal the GPA; it is retained only so QR codes
and certificates printed before share links existed keep resolving.

**Response 404** — `GRANT_NOT_FOUND` when the grant is unknown, revoked, or
belongs to a different credential. All three return an identical body: a
verifier must not be able to probe whether a grant ever existed.

### `GET /hold/me`, `POST /hold/grants`, `DELETE /hold/grants/{grantId}`, `POST /hold/resume-check`

The graduate's own surface, under `/api/v1/hold`. Authentication is possession
of the access link the university handed them, presented as an
`X-Holder-Token` **header** — never a path segment, because request paths are
written to the server access log.

- `GET /hold/me` → the credential (institution, degree, year, GPA, status) plus
  every share link ever minted for it. The GPA comes from a real proof: the
  off-chain index stores no grades.
- `POST /hold/grants` `{"revealGpa": bool}` → 201 with `grantId` and the
  `verifyUrl` to hand an employer.
- `DELETE /hold/grants/{grantId}` → 200. One-way; the link stops disclosing.
- `POST /hold/resume-check` `{"resumeText": str}` → each education claim
  labelled `proven` / `unproven` / `contradicted` against the proven
  credential. `503 AI_UNAVAILABLE` if extraction is unavailable — no partial
  results are ever returned.

Every failed holder lookup — wrong token, malformed token, a credential issued
before student access existed — returns one identical 404.

### `GET /credentials/{credentialId}/certificate`

**Response 200** `application/pdf`. Scoped to the issuing institution; another
issuer's credential reads as absent rather than forbidden. The certificate
carries no student name — the index never stored one — and says so on its face.

**Response 200**

```json
{
  "status": "VALID",
  "disclosed": {
    "institution": "North Valley University",
    "institutionId": "a3f1…",
    "degree": "Master of Artificial Intelligence",
    "degreeCode": 4711,
    "graduationYear": 2026,
    "gpa": null
  },
  "proof": {
    "verified": true,
    "issuerAuthorized": true,
    "revoked": false,
    "networkId": "preview",
    "contractAddress": "0200…",
    "issuanceTxId": "…",
    "stateBlockHeight": 1042,
    "checkedAt": "2026-08-30T14:02:11Z"
  },
  "withheld": ["studentId", "gpa"]
}
```

Note what is **absent** and must stay absent: no student name in `disclosed`, no
issuer wallet address, no `explorerUrl`. The `withheld` array is deliberate
product surface — showing the verifier what they were *not* told is what makes
selective disclosure legible rather than invisible.

| Condition | Response |
|---|---|
| Proof verified, not revoked | `200` `status: "VALID"` |
| `credentialId` in the on-chain `revoked` set | `200` `status: "REVOKED"` |
| Proof generation/verification failed | `200` `status: "INVALID_PROOF"` |
| Unknown `credentialId` | `404 NOT_FOUND` |
| Proof server unreachable / timed out | `503 PROOF_SERVICE_UNAVAILABLE` |
| **Witness vault missing for this credential** | **`503 PROOF_MATERIAL_UNAVAILABLE`** |
| Indexer or node unreachable | `503 CHAIN_UNAVAILABLE` |

`PROOF_MATERIAL_UNAVAILABLE` says our proving material is gone (a wiped volume, a
fresh clone). It says **nothing** about the credential. Without it as a distinct
code, losing the private-state volume would render every real degree on the
platform as forged.

### Why `TAMPERED` is gone

The EVM design compared a recomputed hash against an on-chain one and reported
`TAMPERED` on mismatch. On Midnight there is nothing to compare: altered fields
produce a different commitment, the circuit's assert fails, and **no proof can be
generated at all**. Forgery is unprovable rather than detected, so `TAMPERED` and
`INVALID` collapse into `INVALID_PROOF`.

This matters operationally: `INVALID_PROOF` means *the proof did not verify*,
which is a statement about the credential. `503` means *we could not obtain a
proof*, which is a statement about our infrastructure. Rendering the second as
the first would accuse a legitimate graduate of forgery because a container ran
out of memory. Keep them rigorously distinct in every layer.

### Verification does not submit a transaction

The disclosed claim is the circuit's **public output**, so submitting a
`proveCredential` transaction would permanently publish *"credential X is a 2026
AI Master's with a 3.9 GPA"* — precisely what `data-model.md` forbids. Instead
the chain-service executes the compiled circuit locally against live on-chain
state from the indexer: same asserts, same `persistentCommit`, same commitment
comparison. The proof goes to the verifier, not the ledger — the same shape as a
W3C Verifiable Credential presentation.

Consequences:

- `proof.issuanceTxId` refers to **issuance**. Verification has no transaction of
  its own; do not render one.
- Verification never touches the proof server, so it is fast and cannot be
  starved by issuance load.
- What we may claim: the on-chain commitment could not exist without a
  network-verified ZK proof from an authorized issuer, and the disclosed fields
  are produced by the compiled circuit against live chain state.
  What we may **not** claim: that every verification is verified by the network.

**Measured latency:** issuance proving is **~19s** on a developer laptop.
Verification is local and fast. Call `POST /chain/issue` from a background task
and poll `GET /credentials/{id}`; do not block a request on it.

---

## University endpoints (issuer auth — API key for MVP)

### `POST /credentials`

```json
{
  "student": "Alex Johnson",
  "degree": "Master of Artificial Intelligence",
  "graduation": "May 2026",
  "attributes": { "gpa": "3.9" }
}
```

Pipeline: validate → generate a fresh random `Bytes<32>` **salt** → store
metadata → chain-service proves and submits `issue(credentialId)` → generate QR.

The salt is written to the chain-service private state store and **never
returned in any API response, logged, or persisted to S3**. See `data-model.md`.

**Response 201**: credential object with `status: "PENDING_PROOF"`, moving to
`ISSUED` once the transaction confirms (poll `GET /credentials/{id}`).

> `PENDING_CHAIN` → `PENDING_PROOF`: the wait is dominated by proof generation,
> not block time. The accurate name points debugging at the right component.

### `GET /credentials`
List issued credentials. Filters: `?status=`, `?search=`.

### `GET /credentials/{credentialId}`
Detail including on-chain status, `txId`, `contractAddress`, `networkId`.

### `POST /credentials/{credentialId}/revoke`
Body `{ "reason": "issued_in_error" }`. Proves and submits `revokeCredential`.
Irreversible — requires `X-Confirm-Revoke: true`.
`REVOCATION_PENDING` → `REVOKED` on confirmation.

### `GET /credentials/{credentialId}/qr`
QR-enabled certificate (PNG/PDF). QR payload is the public verify URL only.

---

## Chain-service API (internal, not public)

FastAPI → chain-service over HTTP. Not internet-exposed: it holds witness data
and can generate proofs.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/chain/issue` | prove + submit `issue` |
| `POST` | `/chain/revoke` | prove + submit `revokeCredential` |
| `POST` | `/chain/prove` | prove `proveCredential`, return `DisclosedClaim` |
| `GET` | `/chain/state/{credentialId}` | indexer read: exists / revoked |
| `GET` | `/chain/health` | proof server + indexer + node reachability |
| `POST` | `/chain/authorize-issuer` | onboard a university (no other way to do it) |

`/chain/health` must report the three Midnight services **separately** — "the
chain is down" is not actionable when the node is fine and the proof server is
saturated.

---

## Errors

```json
{
  "error": {
    "code": "PROOF_SERVICE_UNAVAILABLE",
    "message": "Could not generate a proof. This is our problem, not a problem with the credential.",
    "requestId": "…"
  }
}
```

| HTTP | Codes |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED` |
| 403 | `ISSUER_NOT_AUTHORIZED` |
| 404 | `NOT_FOUND` |
| 409 | `CREDENTIAL_ALREADY_REVOKED`, `DUPLICATE_CREDENTIAL` |
| 429 | `RATE_LIMITED` |
| 503 | `PROOF_SERVICE_UNAVAILABLE`, `CHAIN_UNAVAILABLE` |

Error messages are user-facing on the public portal. Phrase 503s so a graduate
is never left thinking their degree was rejected.

## On "show me the transaction"

There is **no PolygonScan for Midnight** — no explorer URL to paste as proof.
Independent verification goes through the indexer GraphQL API
(`midnight-stack.md` §4):

```graphql
query { contractAction(address: "0200…") { __typename } }
```

The verify page should surface `contractAddress`, `txId`, and `networkId`, plus
a copyable indexer query — not a dead explorer link. Anyone can run it against
`https://indexer.preview.midnight.network/api/v4/graphql` without trusting us.

Data shapes: `data-model.md`. Circuits: `smart-contract.md`.
