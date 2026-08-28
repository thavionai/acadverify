# AcadVerify — Deployment & Operations

## Stack

| Concern | Tool |
|---|---|
| Containers | Docker (images in ECR) |
| Compute | ECS Fargate (hackathon) → Kubernetes + Helm (production, future) |
| Storage | S3 (documents, certificates, QR), DynamoDB (metadata) |
| CDN | CloudFront (frontend + S3 assets) |
| Secrets | AWS Secrets Manager (wallet keys, API keys, RPC URLs) |
| Monitoring | CloudWatch (logs, metrics, alarms) |
| IaC | Terraform (`infrastructure/terraform/`) |
| CI/CD | GitHub Actions (`.github/workflows/`) |
| Image scanning | Trivy |
| Chain | Polygon Amoy Testnet (or Base Sepolia) via RPC provider |

## Environments

| Env | Compute | Data | Chain | Purpose |
|---|---|---|---|---|
| dev | local Docker Compose | DynamoDB Local + MinIO/localstack | Hardhat local node | day-to-day development |
| staging | ECS Fargate (staging cluster) | staging DynamoDB/S3 | Polygon Amoy | pre-release verification |
| production | ECS Fargate | prod DynamoDB/S3 | Amoy for MVP → mainnet later | live/demo traffic |

Rule: nothing reaches a higher environment without passing the one below. Chain-affecting production changes require sign-off (see `roles/product-qa.md`).

## CI/CD (GitHub Actions)

Pipelines per component, triggered by path filters matching the branch strategy (`feature/frontend`, `feature/backend`, `feature/blockchain`, `feature/devops`, `feature/docs` → `develop` → `main`):

1. **Lint + test** — frontend (Next.js), backend (FastAPI/pytest), contracts (Hardhat).
2. **Build** — Docker images for frontend and backend.
3. **Scan** — Trivy on every image; high/critical findings block the pipeline.
4. **Push** — tagged images to ECR.
5. **Deploy** — Terraform plan/apply, then ECS service update. `develop` → staging automatically; `main` → production with a manual approval gate.
6. **Contracts** — Hardhat deploy scripts run as a separate, manually-triggered workflow per network; deployed addresses/ABIs are committed back per environment.

## Configuration & secrets

All secrets live in **AWS Secrets Manager**; ECS task definitions inject them at runtime. Never in the repo, never in plain env files in CI.

| Secret / config | Notes |
|---|---|
| `RPC_URL` / `CHAIN_ID` | per environment |
| `CONTRACT_ADDRESS` | `AcademicCredential` address for that env's network |
| Issuer wallet private keys | per institution, MVP platform-custodied; scoped IAM access, access audited |
| Deployer key | used only by the contract-deploy workflow |
| Issuer API keys | hashed in DynamoDB; raw values only in Secrets Manager |

Rotation: issuer wallets rotate via on-chain `revokeIssuer` + `authorizeIssuer`; record each rotation in the ops log.

## Monitoring & logging (CloudWatch)

- **Metrics**: API latency/error rate (public `/verify` tracked separately — tightest SLO), issuance transaction success/failure, pending-transaction age, RPC error rate, ECS task health.
- **Logs**: structured JSON to CloudWatch Logs; PII-free by serializer allowlist; every response carries a `requestId`.
- **Alarms** (each needs a runbook):
  - Public verify 5xx rate > 1% over 5 min.
  - Any credential in `PENDING_CHAIN` > 10 min.
  - RPC provider failures (switch to fallback provider).
  - ECS service below desired task count.

## SLOs (MVP targets)

| Surface | Target |
|---|---|
| Public verification endpoint | 99.9% availability, p95 < 800 ms |
| Issuance API | 99.5% availability |
| Issue → on-chain confirmed | < 5 min p95 (single-tx issuance) |

## Backup & recovery

- DynamoDB: point-in-time recovery enabled; S3: versioning on.
- The chain is the recovery anchor: contract events (`CredentialIssued`, `CredentialRevoked`) allow re-deriving issuance/revocation state after a total database loss; documents restore from S3 versions.

## Incident response

- **Sev1**: a false "VALID" shown for a tampered/revoked credential — stop-ship class; put the public portal into maintenance mode rather than serve wrong results.
- **Sev2**: verification unavailable — must render as a service error, never as "invalid credential".
- Blameless postmortem within 48h for Sev1/Sev2; action items tracked to closure.

Ownership and on-call: see `roles/sre-devops.md`.
