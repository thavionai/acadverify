# chain-service

Node 22 + TypeScript sidecar wrapping Midnight.js. **FastAPI reaches Midnight only
through this service** — Midnight.js is TypeScript-only and Web3.py cannot talk to
Midnight at all.

## Start it (mock mode — available now)

```bash
docker compose up -d chain-service     # from the repo root
# or locally:
nvm use 22 && npm install && npm start
```

`CHAIN_MODE=mock` serves the **identical HTTP contract** with deterministic
fixtures. When live wiring lands, the mode flips and **nothing on your side
changes** — mock and live are two implementations of one interface behind the
same routes, schemas, and error mapping.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/chain/health` | node / indexer / proof-server reported **separately** |
| `POST` | `/chain/issue` | prove + submit `issue` |
| `POST` | `/chain/revoke` | prove + submit `revokeCredential` |
| `POST` | `/chain/prove` | verify; returns disclosed + withheld |
| `GET` | `/chain/state/:credentialId` | cheap indexer read, no proving |
| `POST` | `/chain/authorize-issuer` | onboard a university |

## Fixtures (mock mode)

| Credential ID | Behaviour |
|---|---|
| `ACAD-2026-000001` | VALID |
| `ACAD-2026-000002` | VALID, GPA disclosable |
| `ACAD-2026-000003` | REVOKED |
| `ACAD-2026-000004` | INVALID_PROOF (tampered) |
| `ACAD-2026-000005` | 503 `PROOF_MATERIAL_UNAVAILABLE` |
| anything else | 404 `NOT_FOUND` |

Send `X-Force-Error: CHAIN_UNAVAILABLE` (or any error code) on any request to
exercise failure states without faking them yourself.

```bash
curl -s localhost:8090/chain/prove -H 'Content-Type: application/json' \
  -d '{"credentialId":"ACAD-2026-000002","disclose":["gpa"]}'
```

## The one rule that matters

**`INVALID_PROOF` means the credential failed. `5xx` means *we* failed.**

Never render a 5xx as an invalid credential. Doing so accuses a real graduate of
forgery because a container ran out of memory. `503 PROOF_MATERIAL_UNAVAILABLE`
in particular means our witness vault is missing — it says nothing whatsoever
about the credential.

## Notes for consumers

- `credentialId` is the **human string** (`ACAD-2026-000123`) everywhere on the
  wire. This service converts it to `Bytes<32>` internally.
- `studentId` / `institutionId` / `issuerPk` are **64 lowercase hex chars**.
  This service never sees a name, a degree title, or an institution name —
  FastAPI owns those joins.
- `disclosed.gpaTimes100` is `null` when withheld, **never `0`** (a real 0.00 GPA
  must stay distinguishable).
- `proof.issuanceTxId` refers to **issuance**. Verification does not submit a
  transaction — publishing a verification would publish the disclosure. See
  `docs/api-spec.md`.
