# AcadVerify — Data Model

Two layers with a strict boundary:

- **Private (off-chain, holder-controlled)**: all credential fields, the blinding
  salt, certificate documents, QR assets.
- **Public (on-chain, Midnight ledger)**: blinded commitments, the authorized
  issuer set, revocation flags. **Nothing else.**

Versions and endpoints: `midnight-stack.md`. Contract: `smart-contract.md`.

---

## Why the old SHA256 rule had to go

The pre-Midnight design specified:

```
documentHash = SHA256(canonical_json(document))     # ← DOES NOT WORK ON MIDNIGHT
```

…computed in Python, written on-chain, and re-computed by a verifier to compare.
**Carrying that rule into the Midnight build would silently break the whole
system**, for two independent reasons. Both are worth understanding before
writing any code, because the failure is not obvious — it looks like a
mysterious "commitment mismatch" on every single verification.

**1. The hash is computed somewhere else now.** On Midnight the value the chain
sees is produced *inside the ZK circuit* by `persistentCommit`. That function is
SHA-256 based, but it hashes **Compact's binary encoding of a typed
`CredentialData` struct** — not a UTF-8 JSON string. `hashlib.sha256(json_bytes)`
and `persistentCommit<CredentialData>(fields, salt)` operate on entirely
different byte sequences and will never agree. There is no canonicalization rule
that makes them agree; the fix is to stop computing the value off-chain at all.

**2. A bare hash of a credential is brute-forceable.** The field set is tiny and
low-entropy: a name, a degree from a short list, a year, a GPA to two decimals.
Anyone holding the on-chain hash can enumerate candidate credentials offline
until one matches, recovering the "private" data. The old design papered over
this by salting with a UUID-bearing `credentialId` — but that same
`credentialId` is printed in the QR code, so the salt is public and the
protection is nil. This is precisely the class of leak Midnight exists to
prevent, and shipping it would undercut the project's core claim.

**The rule that replaces it:**

```
commitment = persistentCommit<CredentialData>(credentialFields, credentialSalt)
```

- Computed **only in-circuit**. No backend, script, or test may reimplement it.
- `credentialSalt` is a fresh random `Bytes<32>` per credential, **never
  published** — it is the blinding factor that makes the commitment unopenable.
- The backend never sees a commitment it computed itself; it reads the one the
  chain holds via the indexer.

> **Rule of thumb for reviews:** if any Python or TypeScript file outside the
> generated contract API computes something it calls a "hash" or "commitment"
> of credential fields, that is a bug. The circuit is the only place that
> arithmetic is allowed to happen.

---

## On-chain state (the Midnight ledger)

Exactly four fields, from `midnight/contracts/academic_credential.compact`:

| Ledger field | Type | Contents |
|---|---|---|
| `issuers` | `Set<Bytes<32>>` | authorized issuer public keys |
| `credentials` | `Map<Bytes<32>, Bytes<32>>` | `credentialId` → commitment |
| `revoked` | `Set<Bytes<32>>` | revoked `credentialId`s |
| `platformOwner` | `sealed Bytes<32>` | set once at deployment |

No names, no degrees, no documents, no wallet addresses, no metadata URI.
Compare this against the EVM design it replaces, which stored an issuer address,
a metadata URI, and a timestamp per credential — three extra correlatable
identifiers per student, all of them now gone.

### Private state (witnesses)

Supplied locally at proving time, never transmitted:

| Witness | Type | Held by |
|---|---|---|
| `credentialFields()` | `CredentialData` | student (and platform, MVP) |
| `credentialSalt()` | `Bytes<32>` | student (and platform, MVP) |
| `localSecretKey()` | `Bytes<32>` | issuer / platform owner |

`CredentialData` = `studentId`, `issuerPk`, `institutionId`, `degreeCode`,
`graduationYear`, `gpaTimes100`.

These live in the SDK's `privateStateProvider` (LevelDB in the chain-service).
**That store is the real privacy boundary of this product.** Losing it means
credentials can no longer be proven; leaking it means every commitment it covers
can be opened. Back it up like key material, never like a cache.

---

## Off-chain records

Storage stays DynamoDB + S3 (unchanged, and deliberately so — the hackathon
value is in the privacy layer, not in re-platforming storage). What changed is
**what is allowed in these records**.

### `credentials`

| Attribute | Type | Notes |
|---|---|---|
| `credentialId` (PK) | S | e.g. `ACAD-2026-000123`; also the on-chain map key |
| `institutionId` | S | GSI partition key |
| `student` | S | holder name — **off-chain only** |
| `degree` / `graduation` | S | human-readable, for the dashboard |
| `attributes` | M | GPA, honors |
| `certificateS3Key` | S | QR-enabled certificate |
| `status` | S | `PENDING_PROOF` \| `ISSUED` \| `REVOCATION_PENDING` \| `REVOKED` |
| `txId` | S | Midnight transaction identifier |
| `contractAddress` | S | deployed contract this credential lives in |
| `networkId` | S | `undeployed` \| `preview` \| `preprod` |
| `issuedAt` / `updatedAt` | S | ISO 8601 |

Removed from the EVM design: `documentHash` (the commitment is on-chain, and we
must not cache an openable copy), `chainId` (replaced by `networkId`),
`issuerWallet` (no addresses), `documentS3Key` (see below).

> **`status` renamed.** `PENDING_CHAIN` → `PENDING_PROOF`, because the wait is
> dominated by proof generation, not block time. Naming it accurately stops
> people debugging the wrong component when it hangs.

### `institutions`

| Attribute | Type | Notes |
|---|---|---|
| `institutionId` (PK) | S | |
| `name` | S | |
| `issuerPk` | S | `Bytes<32>` hex — the key authorized in the `issuers` set |
| `apiKeyHash` | S | hashed issuer API key |
| `status` | S | `ACTIVE` \| `DEACTIVATED` |

`issuerWallet` (an `0x…` address) → `issuerPk` (a Midnight public key derived
in-circuit via `publicKey(sk)`). Not a rename — a different key type entirely.

### `revocations`

| Attribute | Type |
|---|---|
| `credentialId` (PK) | S |
| `reason` | S (internal only — the portal shows just "REVOKED") |
| `txId` | S |
| `revokedAt` | S |

### S3 layout

```
s3://acadverify-<env>/
├── certificates/<credentialId>.pdf   # QR-enabled certificate for download
└── qr/<credentialId>.png             # QR image (encodes the public verify URL)
```

`documents/<credentialId>.json` is **gone**. It existed to be the canonical
pre-image of the on-chain hash; that pre-image is now witness data, and writing
it to shared object storage would recreate the exact leak the commitment scheme
removes.

---

## The salt is the crown jewel

| Property | Consequence |
|---|---|
| Salt lost | Credential can never be proven again. Unrecoverable — reissue is the only fix. |
| Salt leaked | The commitment becomes openable; the credential's fields are exposed. |
| Salt reused across credentials | Two commitments become linkable. Always generate fresh. |

MVP: the platform custodies salts alongside the private state store. Student-held
salts (Lace wallet) are the stretch — and the honest framing in the demo is that
platform custody is a *deployment* choice, not a protocol limitation. The
contract is already agnostic about who supplies the witness.

---

## QR payload

Unchanged:

```
https://<domain>/verify/ACAD-2026-000123
```

The QR encodes only the credential ID and never the salt or any field — a QR
code is photographed, screenshared, and pasted into chats, so anything inside it
should be considered public.

---

## Retention & erasure

Materially stronger than the EVM design, and worth saying out loud in the pitch:

- **Erasure**: delete the off-chain record *and the salt*. The on-chain
  commitment becomes a permanently unopenable 32 bytes — not merely
  "unlinkable", but information-theoretically closed to anyone without the salt.
- The old design could only promise the hash was "no longer linkable to a
  person", while remaining brute-forceable in practice. This one does not have
  that asterisk.
- Logs must never contain credential fields or salts — enforced by serializer
  allowlists and a test, not by convention.
