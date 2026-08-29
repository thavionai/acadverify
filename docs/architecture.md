# AcadVerify — Architecture

**Privacy-preserving academic credential verification on Midnight.**

The problem and the product are unchanged from the original design. What changed
is the chain layer and, consequently, what a verification actually reveals.
Versions and endpoints: `midnight-stack.md`.

## Problem Statement

Academic credential fraud is a global problem, and verifying a real credential
is slow and invasive:

- Manual verification takes days or weeks of emails
- High administrative cost per check
- Forged certificates and lost records
- Cross-border verification is worse on every axis
- **And the honest path is over-disclosing**: to prove one degree, a student
  hands over a full transcript containing grades, dates, and course history the
  verifier never needed

That last point is the one blockchain projects usually make *worse*, by putting
a permanent, correlatable record of every credential on a public ledger.

## Solution

Universities issue credentials as **blinded commitments** on Midnight. Anyone
can verify — in seconds, from a QR code — that a credential is valid,
non-revoked, and from an authorized issuer, **via a zero-knowledge proof that
reveals only the fields the student consented to share**.

| Property | Before (EVM design) | Now (Midnight) |
|---|---|---|
| On-chain per credential | SHA256 hash, issuer address, metadata URI, timestamp | one blinded commitment |
| Verifier learns | every field in the credential document | only the consented fields |
| Tampered credential | detected by hash mismatch | **cannot produce a proof at all** |
| Brute-force risk | real — low-entropy fields, public salt | none — commitment is blinded |
| Erasure | hash remains, "unlinkable" but brute-forceable | delete the salt; commitment is permanently unopenable |

## Key Features

### University Portal
Issue credentials, view issued list, revoke, download QR-enabled certificates.

### Public Verification Portal
Scan a QR or enter a credential ID; get an unambiguous result with issuer
identity and the disclosed fields — no login, no account.

### Privacy features (the Midnight layer)
- Commitments on-chain; **no personal data, and no hash of personal data**
- Selective disclosure — the holder chooses which fields the proof reveals
- Authorized-issuer proofs without wallet addresses
- On-chain revocation, instantly checkable
- Forgery is unprovable rather than merely detectable

## High-Level Architecture

```
   University Admin                              Employer / Verifier
          │                                              │
          ▼                                              ▼
   ┌──────────────┐                              ┌──────────────┐
   │  Next.js UI  │                              │  Verify page │
   │  (dashboard) │                              │   (public)   │
   └──────┬───────┘                              └──────┬───────┘
          │                    REST /api/v1             │
          └───────────────┬──────────────────────────────┘
                          ▼
                 ┌─────────────────┐        metadata      ┌──────────────┐
                 │ FastAPI backend │◀────────────────────▶│ DynamoDB / S3│
                 │  (orchestrator) │                      └──────────────┘
                 └────────┬────────┘
                          │  HTTP (issue / revoke / prove)
                          ▼
                 ┌─────────────────────────────┐
                 │  chain-service (Node 22/TS) │
                 │  Midnight.js SDK v4.1.1     │
                 │  + generated contract API   │
                 │  + privateStateProvider     │◀── witness data (salts, fields)
                 └───┬────────────┬────────────┘
                     │            │
        ZK proving   │            │  queries + submit
                     ▼            ▼
           ┌──────────────┐   ┌──────────────┐    ┌──────────────┐
           │ Proof server │   │   Indexer    │───▶│ Midnight node│
           │    :6300     │   │ GraphQL :8088│    │    :9944     │
           └──────────────┘   └──────────────┘    └──────────────┘
```

### Why a separate chain-service

Midnight.js is TypeScript-only — **there are no Python bindings, so Web3.py
cannot talk to Midnight.** FastAPI keeps owning REST, metadata, QR, and storage;
it calls the chain-service over HTTP for anything requiring a proof. This is a
hard constraint of the platform, not a preference.

## Technology Stack

### Frontend
- Next.js, React, TypeScript, TailwindCSS
- `@midnight-ntwrk/dapp-connector-api` — Lace wallet (Midnight edition)
- *(no ethers.js / viem — there is no EVM in the primary path)*

### Backend
- FastAPI (Python) — REST, metadata, QR, orchestration
- *(no Web3.py — it cannot reach Midnight)*

### Chain-service
- Node.js 22+, TypeScript
- `@midnight-ntwrk/midnight-js-*` v4.1.1
- Generated contract API from `compact compile`

### Chain / privacy layer
- **Compact** 0.31.1 (language 0.23.0, runtime 0.16.0) — `academic_credential.compact`
- **Proof server** — ZK proof generation (:6300)
- **Indexer** — GraphQL chain state (:8088)
- **Midnight node** — Substrate RPC (:9944)
- Networks: `undeployed` (local) → `preview` (demo)

### Cloud / DevOps
- Docker + Docker Compose (local: 3 Midnight services + DynamoDB Local + MinIO)
- AWS ECS Fargate, ECR, S3, DynamoDB, CloudFront, Secrets Manager, CloudWatch
- Terraform, GitHub Actions, Trivy

## User Workflow

```
University issues credential
    │
    ▼
Generate random salt (Bytes<32>)  ─── stays private, never published
    │
    ▼
chain-service → proof server: prove issue()
    │
    ▼
commitment written on-chain (credentialId -> commitment)
    │
    ▼
Store metadata off-chain (DynamoDB/S3) + generate QR
    │
    ▼
Student receives QR-enabled certificate
    │
    ▼
Employer scans QR → /verify/{credentialId}
    │
    ▼
chain-service → proof server: prove proveCredential(id, revealGpa)
    │
    ▼
VALID (+ disclosed fields) / REVOKED / INVALID_PROOF / service error
```

## Verification flow (the critical path)

1. Verifier scans the QR or enters a credential ID.
2. Backend loads display metadata from DynamoDB and calls the chain-service.
3. Chain-service loads the witness (fields + salt) from its private state store
   and requests a proof of `proveCredential` from the proof server.
4. The circuit asserts: the commitment matches, the issuer is authorized, and
   the credential is not revoked — then returns only `DisclosedClaim`.
5. UI renders exactly one of **VALID**, **REVOKED**, **INVALID_PROOF**, or
   **Not found**. A proof-server or node outage renders as a **service error**,
   never as an invalid credential.

**Proof generation, not block time, is the latency here.** The proof server
defaults to 2 workers; verification is CPU-bound. Size for it (`deployment.md`).

## Trust model

- The chain is the source of truth for credential existence, issuer
  authorization, and revocation. DynamoDB/S3 hold only human-readable metadata
  for the dashboard.
- A verifier does not have to trust AcadVerify: the ZK proof is checked against
  the on-chain commitment and verifying key. A doctored credential cannot yield
  a passing proof regardless of what our backend claims.
- **What the verifier still trusts us for (MVP):** the platform custodies
  witness data and generates proofs on the student's behalf, so it *could* refuse
  to prove, or prove for someone who should not be able to. Moving proving to
  the student's Lace wallet removes this and is the stated stretch goal. The
  contract is already agnostic about who supplies the witness — this is a
  deployment choice, not a protocol limitation.
- Universities are onboarded off-chain; their issuer public keys are authorized
  on-chain by the platform owner.

Related: `midnight-stack.md`, `data-model.md`, `api-spec.md`,
`smart-contract.md`, `deployment.md`.
