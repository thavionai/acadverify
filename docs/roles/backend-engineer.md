# Backend Engineer

## Mission

Own the off-chain services of AcadVerify: the FastAPI REST APIs, credential lifecycle logic, data storage, and the bridge between universities, verifiers, and the blockchain.

## Owns

- FastAPI
- REST APIs
- Blockchain Integration (Web3.py)
- Database (DynamoDB + S3)
- QR Generation

## Responsibilities

- Design and implement the REST APIs in `backend/`: credential issuance, listing/search, revocation, and the public verification endpoint (see `../api-spec.md`).
- Own SHA256 hash generation and JSON canonicalization so stored documents deterministically match their on-chain hashes — this rule is shared with independent verifiers and must never fork (see `../data-model.md`).
- Integrate with `AcademicCredential.sol` via Web3.py: send issue/revoke transactions, read verification state, track pending transactions to confirmation.
- Manage data storage: DynamoDB for credential/institution metadata, S3 for canonical documents, QR-enabled certificates, and QR images.
- Generate QR codes encoding the public verification URL, and the downloadable QR-enabled certificate.
- Implement issuer authentication (API keys for MVP; university login is a future enhancement) and input validation on all endpoints.
- Enforce honest failure modes: a chain/RPC outage returns `503 CHAIN_UNAVAILABLE`, never a "TAMPERED" or "invalid" result.
- Keep the FastAPI OpenAPI docs (`/docs`) accurate with every endpoint change.

## Works on branch

`feature/backend`

## Interfaces with other roles

- **Blockchain Engineer** ([blockchain-engineer.md](blockchain-engineer.md)): consumes contract ABI/address; jointly owns the hashing and credential-ID contract between off-chain records and on-chain state.
- **Frontend Engineer** ([frontend-engineer.md](frontend-engineer.md)): provides stable APIs and clear error semantics so the UI can distinguish VALID / REVOKED / TAMPERED / service error.
- **SRE/DevOps** ([sre-devops.md](sre-devops.md)): health checks, CloudWatch metrics, Docker image, Secrets Manager wiring.
- **Product/QA** ([product-qa.md](product-qa.md)): acceptance criteria for endpoints; seed data in `data/`.

## Definition of done

- New endpoints have unit and integration tests, including failure modes (hash mismatch, revoked credential, unauthorized issuer, chain unavailable).
- No PII reaches logs, error messages, or on-chain payloads — enforced by test or serializer allowlist, not convention.
- OpenAPI spec and `../api-spec.md` are updated in the same change.
