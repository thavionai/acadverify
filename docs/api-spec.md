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

Verify a credential. Optional `?disclose=gpa` requests GPA disclosure (default:
withheld).

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
    "txId": "…",
    "provedAt": "2026-08-30T14:02:11Z"
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
| Indexer or node unreachable | `503 CHAIN_UNAVAILABLE` |

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

**Latency:** this endpoint generates a ZK proof and is CPU-bound on the proof
server (default 2 workers, 10-min job TTL). It is not a sub-100ms lookup — cache
results per `(credentialId, disclosure set)` and size the SLO accordingly.

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
