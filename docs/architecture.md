# AcadVerify — Architecture

> **Midnight integration (hackathon pivot):** the chain layer now targets the
> **Midnight network** — a Compact smart contract with zero-knowledge verification,
> reached from FastAPI via a Node/TS chain-service (MidnightJS has no Python bindings).
> See `midnight-integration.md` for the updated chain architecture; the EVM design
> below is retained as the Cross-Chain stretch (public anchor on Polygon).

## Problem Statement

Academic credential fraud continues to be a significant issue worldwide.

Traditional verification methods suffer from:

- Manual verification processes
- Long response times
- High administrative costs
- Forged certificates
- Lost academic records
- Difficult cross-border verification

Employers often spend days or weeks verifying degrees by contacting institutions directly. AcadVerify solves this by providing instant blockchain-based verification.

## Solution

AcadVerify allows authorized universities to issue blockchain-backed digital credentials.

Each credential is:

- Cryptographically signed
- Immutable
- Publicly verifiable
- Instantly accessible
- Revocable by the issuing institution
- Tamper evident

**Core principle: instead of storing personal information on-chain, only a secure cryptographic hash (SHA256) of the credential is stored.** All personal data lives off-chain in AWS (DynamoDB + S3); the chain holds proofs, never data.

## Key Features

### University Portal

- Login (future enhancement)
- Issue academic certificates
- View issued credentials
- Revoke credentials
- Search credentials
- Download QR-enabled certificates

### Public Verification Portal

Anyone can:

- Scan QR Code
- Enter Credential ID
- Verify authenticity
- Check issuer
- Check blockchain transaction
- Detect tampered certificates
- Detect revoked certificates

### Blockchain Features

- Immutable credential records
- Authorized issuer wallets
- Smart contract verification
- Event logging
- Credential revocation
- Hash-based integrity verification

## High-Level Architecture

```
                  +----------------------+
                  |      University      |
                  +----------+-----------+
                             |
                             |
                      Issue Credential
                             |
                             |
                    +--------v--------+
                    |    Backend API   |
                    +--------+--------+
                             |
            +----------------+----------------+
            |                                 |
            |                                 |
      Store Metadata                    Generate SHA256
            |                                 |
            |                                 |
           S3                           Smart Contract
            |                                 |
            |                                 |
            +----------------+----------------+
                             |
                             |
                     Blockchain Network
                             |
                             |
                  Public Verification Portal
                             |
                             |
                        Employer / Student
```

## Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- TailwindCSS
- ethers.js / viem

### Backend

- FastAPI (Python)
- REST APIs
- Web3.py

### Blockchain

- Solidity
- Hardhat
- OpenZeppelin Contracts
- Polygon Amoy Testnet (or Base Sepolia)

### Cloud

- AWS
- ECS Fargate (Hackathon)
- ECR
- S3
- DynamoDB
- CloudFront
- CloudWatch
- Secrets Manager
- Terraform

### DevOps

- Docker
- GitHub Actions
- Terraform
- Trivy
- Helm (Future)
- Kubernetes (Production)

## Project Components

### Frontend

- University Dashboard
- Credential Form
- Verification Portal
- QR Scanner
- Blockchain Status

### Backend

- REST APIs
- Blockchain Integration (Web3.py)
- Hash Generation (SHA256)
- QR Generation
- Metadata Storage (DynamoDB + S3)
- Validation

### Blockchain

- Credential Storage (`AcademicCredential.sol`)
- Verification
- Revocation
- Events
- Access Control (authorized issuer wallets)

### DevOps

- Infrastructure (Terraform on AWS)
- Docker
- CI/CD (GitHub Actions)
- AWS Deployment (ECS Fargate)
- Monitoring & Logging (CloudWatch)
- Security (Secrets Manager, Trivy)

## User Workflow

```
University
    │
    ▼
Issue Credential
    │
    ▼
Generate SHA256 Hash
    │
    ▼
Write Hash to Blockchain
    │
    ▼
Store Metadata
    │
    ▼
Generate QR Code
    │
    ▼
Student Receives Certificate
    │
    ▼
Employer Scans QR
    │
    ▼
Blockchain Verification
    │
    ▼
VALID / REVOKED / TAMPERED
```

## Verification flow (the critical path)

1. Verifier scans the QR code or enters a Credential ID on the public portal.
2. Backend fetches the credential metadata (DynamoDB) and recomputes the SHA256 hash of the stored document.
3. Backend calls the `AcademicCredential` contract via Web3.py: does the credential exist, does the on-chain hash match, is the issuer authorized, is it revoked?
4. UI renders exactly one of: **VALID**, **REVOKED**, **TAMPERED**, or **Not found** — a backend/service failure must render as a service error, never as an invalid credential.

## Trust model

- The chain is the source of truth for credential existence, hash integrity, issuer identity, and revocation status; DynamoDB/S3 hold the human-readable metadata.
- A verifier who distrusts AcadVerify can independently hash the certificate document and compare it against the on-chain record via the transaction shown on the verify page.
- Universities are onboarded off-chain and their issuer wallets are authorized on-chain by the contract owner.

Related docs: `data-model.md`, `api-spec.md`, `smart-contract.md`, `deployment.md`.
