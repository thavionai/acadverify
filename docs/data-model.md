# AcadVerify — Data Model

Two layers with a strict boundary:

- **Off-chain (DynamoDB + S3)**: all personal data, credential metadata, certificate documents, QR assets.
- **On-chain (`AcademicCredential.sol`)**: Credential ID, SHA256 document hash, issuer wallet, metadata URI, timestamp, revocation status — nothing else.

Nothing containing personal information may cross that boundary. Deleting the off-chain record leaves the on-chain hash as an unlinkable value.

## On-chain record

See `smart-contract.md` for the contract interface. Per credential:

```
credentialId       bytes32   keccak256(utf8(credentialIdString))
documentHash       bytes32   SHA256(canonical credential document)
issuerWallet       address
metadataURI        string    S3/CloudFront URL (IPFS: future enhancement)
timestamp          uint256
revoked            bool
```

## DynamoDB tables

### `credentials`

| Attribute | Type | Notes |
|---|---|---|
| `credentialId` (PK) | S | e.g. `ACAD-2026-000123` — embeds a UUID component so identical degrees still get unique IDs |
| `institutionId` | S | GSI partition key for "list my credentials" |
| `student` | S | holder name |
| `degree` | S | e.g. `Master of Artificial Intelligence` |
| `graduation` | S | e.g. `May 2026` |
| `attributes` | M | free-form extras (GPA, honors) |
| `documentHash` | S | SHA256 hex — must match on-chain |
| `documentS3Key` | S | canonical credential JSON in S3 |
| `certificateS3Key` | S | QR-enabled certificate (PDF/PNG) |
| `txHash` | S | issuance transaction |
| `chainId` | N | |
| `status` | S | `PENDING_CHAIN` \| `ISSUED` \| `REVOCATION_PENDING` \| `REVOKED` |
| `issuedAt` / `updatedAt` | S | ISO 8601 |

GSIs: `institutionId-issuedAt-index` (dashboard listing), `status-index` (pending-transaction sweeper).

### `institutions`

| Attribute | Type | Notes |
|---|---|---|
| `institutionId` (PK) | S | |
| `name` | S | |
| `issuerWallet` | S | address authorized on-chain |
| `apiKeyHash` | S | hashed issuer API key (login is a future enhancement) |
| `status` | S | `ACTIVE` \| `DEACTIVATED` |

### `revocations`

| Attribute | Type | Notes |
|---|---|---|
| `credentialId` (PK) | S | |
| `reason` | S | internal only — the public portal shows just "REVOKED" |
| `txHash` | S | |
| `revokedAt` | S | |

## S3 layout

```
s3://acadverify-<env>/
├── documents/<credentialId>.json        # canonical credential document (hashed content)
├── certificates/<credentialId>.pdf      # QR-enabled certificate for download
└── qr/<credentialId>.png                # QR image (encodes the public verify URL)
```

Served to browsers via CloudFront; buckets are private with CloudFront origin access.

## Hashing rule (the contract between layers)

```
documentHash = SHA256(canonical_json(document))
```

- `canonical_json` = JSON with sorted keys, no insignificant whitespace, UTF-8 (RFC 8785–style) — so key order can never change the hash.
- Implemented once in the backend (`backend/`) and mirrored in verification tooling. This rule is shared between the backend and any independent verifier and must never fork.
- The canonical document contains the `credentialId` (with its UUID component), which acts as a salt against dictionary attacks on the on-chain hash.

### Canonical credential document

```json
{
  "credentialId": "ACAD-2026-000123",
  "institution": { "id": "…", "name": "North Valley University" },
  "student": "Alex Johnson",
  "degree": "Master of Artificial Intelligence",
  "graduation": "May 2026",
  "attributes": { "gpa": "3.9" },
  "issuedAt": "2026-05-20T00:00:00Z"
}
```

W3C Verifiable Credentials alignment is a listed future enhancement; the MVP document stays minimal.

## QR payload

The QR code encodes the public verification URL:

```
https://<domain>/verify/ACAD-2026-000123
```

Scanning opens the public portal, which calls `GET /api/v1/verify/{credentialId}` (see `api-spec.md`).

## Retention & erasure

- Student erasure request → delete the DynamoDB item's personal fields and the S3 documents; the on-chain hash remains but is no longer linkable to a person.
- Logs must never contain document contents or student PII (enforced by serializer allowlists, not convention).
