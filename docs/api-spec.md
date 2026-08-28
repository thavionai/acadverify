# AcadVerify — API Specification

Backend: **FastAPI (Python)** with **Web3.py** for blockchain integration.
Base URL: `/api/v1` · Format: JSON · Interactive docs: `/docs` (FastAPI Swagger UI).

## Backend responsibilities

- REST APIs
- Blockchain Integration (read/write via Web3.py)
- Hash Generation (SHA256 over the canonical credential document)
- QR Generation (QR encodes the public verification URL + credential ID)
- Metadata Storage (DynamoDB for records, S3 for certificate files)
- Validation

## Conventions

- Timestamps are ISO 8601 UTC.
- `credentialId` is the public identifier (also embedded in the QR code).
- Document hashes are SHA256 hex strings.
- List endpoints support `?page=` and `?limit=` (default 20, max 100).

---

## Public endpoints (no auth)

### `GET /verify/{credentialId}`

Verify a credential by ID (typed in or decoded from a QR scan).

**Response 200**

```json
{
  "status": "VALID",                    // VALID | REVOKED | TAMPERED
  "credential": {
    "credentialId": "ACAD-2026-000123",
    "student": "Alex Johnson",
    "institution": "North Valley University",
    "degree": "Master of Artificial Intelligence",
    "graduation": "May 2026"
  },
  "blockchain": {
    "exists": true,
    "hashVerified": true,
    "issuerVerified": true,
    "active": true,
    "issuerWallet": "0x…",
    "txHash": "0x7e9ab23…",
    "explorerUrl": "https://amoy.polygonscan.com/tx/0x7e9ab23…"
  }
}
```

Sample rendered result on the portal:

```
Credential Status

✅ VERIFIED

Student:
Alex Johnson

Institution:
North Valley University

Degree:
Master of Artificial Intelligence

Graduation:
May 2026

Blockchain Status:
✔ Credential Exists
✔ Hash Verified
✔ Issuer Verified
✔ Active

Transaction:
0x7e9ab23...
```

- Unknown ID → `404 NOT_FOUND`.
- Stored metadata hash ≠ on-chain hash → `status: "TAMPERED"`.
- On-chain revocation flag set → `status: "REVOKED"`.
- RPC/chain unavailable → `503 CHAIN_UNAVAILABLE` — a service failure must never be reported as an invalid credential.

---

## University endpoints (issuer auth — API key for MVP; login is a future enhancement)

### `POST /credentials`

Issue a credential.

```json
{
  "student": "Alex Johnson",
  "degree": "Master of Artificial Intelligence",
  "graduation": "May 2026",
  "attributes": { "gpa": "3.9" }
}
```

Pipeline (see `architecture.md` user workflow): validate → store metadata (DynamoDB/S3) → SHA256 hash → `issueCredential` transaction on-chain → generate QR → return credential.

**Response 201**: credential object with `status: "PENDING_CHAIN"`, moving to `ISSUED` once the transaction confirms (poll `GET /credentials/{id}`).

### `GET /credentials`

List issued credentials. Filters: `?status=`, `?search=` (student name / degree / credential ID).

### `GET /credentials/{credentialId}`

Credential detail including on-chain status and `txHash`.

### `POST /credentials/{credentialId}/revoke`

Body: `{ "reason": "issued_in_error" }`. Sends the on-chain revocation transaction. Irreversible — requires confirmation header `X-Confirm-Revoke: true`. Status: `REVOCATION_PENDING` → `REVOKED` on confirmation.

### `GET /credentials/{credentialId}/qr`

Returns the QR-enabled certificate (PNG or PDF) for download. QR payload: the public verification URL containing the credential ID.

---

## Errors

```json
{
  "error": {
    "code": "CREDENTIAL_ALREADY_REVOKED",
    "message": "This credential was revoked on 2026-06-01.",
    "requestId": "…"
  }
}
```

| HTTP | Codes (non-exhaustive) |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED` |
| 403 | `ISSUER_NOT_AUTHORIZED` |
| 404 | `NOT_FOUND` |
| 409 | `CREDENTIAL_ALREADY_REVOKED`, `DUPLICATE_CREDENTIAL` |
| 429 | `RATE_LIMITED` (public verify: per-IP) |
| 503 | `CHAIN_UNAVAILABLE` |

Data shapes: `data-model.md`. On-chain interface: `smart-contract.md`.
