# Backend Engineer (FastAPI)

## Mission

Own the off-chain services: REST APIs, credential lifecycle, metadata storage,
QR generation, and orchestration between universities, verifiers, and the
chain-service.

## Owns

- FastAPI (`backend/`)
- REST APIs (`../api-spec.md`)
- DynamoDB + S3
- QR generation
- Issuer authentication

## Responsibilities

- Implement issuance, listing/search, revocation, and the public verification
  endpoint.
- **Call the chain-service over HTTP for anything requiring a proof.**
  `web3` is not a dependency of this service — Web3.py cannot talk to Midnight.
  If you find yourself reaching for an RPC client, the call belongs in the
  chain-service.
- **Never compute a commitment or hash of credential fields.** That arithmetic
  happens only inside the circuit; a Python SHA256 will never match
  `persistentCommit` and reimplementing it is a bug, not an optimisation. See
  `../data-model.md`.
- Store metadata in DynamoDB and certificates/QR in S3. **Do not store the
  canonical credential document** — it is the commitment pre-image and belongs
  in witness storage only.
- Generate QR codes encoding the public verify URL and nothing else.
- Implement issuer API-key auth and input validation.
- Enforce honest failure modes: proof-server outage → `503
  PROOF_SERVICE_UNAVAILABLE`; chain outage → `503 CHAIN_UNAVAILABLE`. **Never
  render either as `INVALID_PROOF`.**
- Surface the `withheld` list in verify responses so the UI can show what was
  *not* disclosed.
- Keep `/docs` accurate with every endpoint change.

## Branch

`<yourname>-backend`

## Interfaces

- **Chain-service** ([chain-service-engineer.md](chain-service-engineer.md)):
  owns the HTTP contract between the services.
- **Frontend** ([frontend-engineer.md](frontend-engineer.md)): stable APIs and
  error semantics.
- **SRE/DevOps** ([sre-devops.md](sre-devops.md)): health checks, metrics,
  images, secrets.
- **Product/QA** ([product-qa.md](product-qa.md)): acceptance criteria, seed data.

## Definition of done

- Endpoints have unit and integration tests including failure modes (revoked,
  unauthorized issuer, proof service down, chain down).
- No credential fields or salts in logs, error messages, or responses —
  enforced by a test, not convention.
- Verify responses distinguish "the credential failed" from "we failed".
- `../api-spec.md` updated in the same change.
