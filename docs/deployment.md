# AcadVerify — Deployment & Operations

Versions, endpoints, and component names: `midnight-stack.md`.

## Stack

| Concern | Tool |
|---|---|
| **Chain** | **Midnight** — `preview` network (`undeployed` locally) |
| **Contract** | Compact 0.31.1 (runtime 0.16.0) → `academic_credential.compact` |
| **Proving** | Midnight **proof server** (`midnightntwrk/proof-server:<version>`, :6300) |
| **Chain reads** | Midnight **indexer** GraphQL (:8088, `/api/v4/graphql`) |
| **Chain RPC** | Midnight **node** (:9944) |
| **Chain client** | chain-service (Node 22 + Midnight.js 4.1.1) |
| Containers | Docker (images in ECR) |
| Compute | ECS Fargate |
| Storage | S3 (certificates, QR), DynamoDB (metadata) |
| CDN | CloudFront |
| Secrets | AWS Secrets Manager |
| Monitoring | CloudWatch |
| IaC | Terraform |
| CI/CD | GitHub Actions |
| Scanning | Trivy |

**No RPC provider, no `CHAIN_ID`, no Polygon.** Those belong to the Cross-Chain
stretch only.

## Environments

| Env | Compute | Data | Midnight |
|---|---|---|---|
| dev | Docker Compose | DynamoDB Local + MinIO | local devnet (`undeployed`): node + indexer + proof server |
| staging | ECS Fargate | staging DynamoDB/S3 | `preview` + self-hosted proof server |
| demo/prod | ECS Fargate | prod DynamoDB/S3 | `preview` + self-hosted proof server |

Nothing reaches a higher environment without passing the one below.

## Deploying the contract

Contract deployment is **not** a Terraform concern — it happens through the
chain-service using `deployContract` from `@midnight-ntwrk/midnight-js-contracts`.

1. `compact compile` → `contract/`, `keys/`, `zkir/`, `compiler/`
2. **Ship `keys/` and `zkir/` with the chain-service image.** The
   `zkConfigProvider` loads them at runtime; a container without them cannot
   prove anything. This is the most common broken-deploy cause — the image builds
   fine and fails at the first proof.
3. `setNetworkId("preview")` before constructing providers
4. `deployContract(...)` → commit the address to `midnight/deployments/preview.json`
5. `authorizeIssuer` once per university
6. Contract deploys are a **separate, manually-triggered workflow** per network

Redeploying produces a **new contract address with empty state** — previously
issued credentials do not carry over. Treat a redeploy during demo weekend as a
recovery-only action.

## Running the proof server

Self-hosted in every non-local environment. It is the latency- and
cost-determining component.

| Setting | Guidance |
|---|---|
| `--num-workers` | Default 2. Match to vCPU; this is the throughput knob. |
| `--job-timeout` | Default 600s. |
| `--job-capacity` | Default unlimited — **set a real bound in production** so a queue spike sheds load instead of exhausting memory. |
| Sizing | CPU-bound and memory-hungry; give it 4 GB+ and prefer compute-optimised tasks. |

Never expose it publicly: anything that can reach it can consume all proving
capacity. It sits behind the chain-service in a private subnet.

## Configuration & secrets

| Secret / config | Notes |
|---|---|
| `MIDNIGHT_NETWORK_ID` | `undeployed` \| `preview` \| `preprod` |
| `MIDNIGHT_NODE_URL` | node RPC |
| `MIDNIGHT_INDEXER_URL` / `_WS` | indexer GraphQL HTTP + WS |
| `MIDNIGHT_PROOF_SERVER_URL` | internal only |
| `CONTRACT_ADDRESS` | per network, from `midnight/deployments/` |
| **Issuer / platform-owner seeds** | Secrets Manager. Midnight **seeds**, not EVM private keys. |
| **Credential salts + private state** | see below — the hardest operational problem |
| Issuer API keys | hashed in DynamoDB; raw only in Secrets Manager |

### Private state is not a cache

The chain-service `privateStateProvider` (LevelDB) holds credential fields and
salts. It has an unusual property: **it is simultaneously unbackupable-if-leaked
and unrecoverable-if-lost.**

- Lost → every affected credential becomes permanently unprovable. No re-derivation
  exists; the salt is random.
- Leaked → commitments become openable and the privacy guarantee is void.

So: encrypted persistent volume, encrypted backups with tightly scoped access,
restores tested, and **never** an ephemeral container filesystem. Running the
chain-service as a stateless multi-replica ECS service without a shared
encrypted store will silently lose credentials as tasks recycle. Single task
with a persistent encrypted volume for the MVP; document the sharding story
rather than pretending replicas are free.

## Monitoring & logging

- **Metrics**: public `/verify` latency and error rate (tightest SLO); **proof
  generation duration and queue depth**; proof failure rate; indexer query
  latency; `PENDING_PROOF` age; ECS task health.
- **Logs**: structured JSON, PII-free by serializer allowlist, `requestId` on
  every response. **A credential field or salt in a log is a P0 incident** — not
  a hygiene issue.
- **Alarms** (each needs a runbook):
  - Public verify 5xx > 1% over 5 min
  - Proof server queue depth rising, or p95 proof time > 30s
  - Any credential `PENDING_PROOF` > 10 min
  - Indexer/node unreachable
  - Private-state volume > 80% full, or backup older than 24h

Alarm on the three Midnight services **separately**. "The chain is down" is not
actionable when the node is healthy and the proof server is saturated.

## SLOs (MVP targets)

| Surface | Target |
|---|---|
| Public verification endpoint | 99.9% availability, **p95 < 2s** (local circuit execution, no proof server) |
| Issuance API (excluding proof) | 99.5% availability |
| Issue → on-chain confirmed | < 5 min p95 |

The old p95 < 800 ms target was written for an EVM `view` call. **Measured on a
developer laptop: issuance proving takes ~19s**; verification is local circuit
execution and is fast, because it never touches the proof server (see
`api-spec.md`). Issuance must therefore be a background task with polling, never
a blocking request — and `--num-workers` should be raised above the default 2
before the demo.

## Backup & recovery

- DynamoDB PITR; S3 versioning.
- **Private state store: encrypted, backed up, restore-tested.** This is the
  single point of unrecoverable loss in the system.
- The chain is *not* a full recovery anchor here. Commitments cannot be reopened
  without salts, so unlike the EVM design we cannot re-derive credential state
  from chain events alone. This is the deliberate cost of the privacy guarantee
  and must be stated in any recovery plan.

## Incident response

- **Sev1**: a false `VALID` for a revoked or forged credential — stop-ship; put
  the portal in maintenance mode rather than serve wrong results.
- **Sev1**: credential fields or salts in logs, backups, or any API response.
- **Sev2**: verification unavailable — must render as a service error, never as
  an invalid credential.
- Blameless postmortem within 48h for Sev1/Sev2.

## CI/CD

1. **Lint + test** — frontend, backend (pytest), **`compact compile` must succeed**,
   chain-service tests
2. **Contract surface check** — diff `compiler/contract-info.json`; a change to
   any circuit's arguments or result type is a reviewed privacy change, because
   that file is the machine-checkable record of what the contract can reveal
3. **Build** — Docker images (chain-service image **must include `keys/` + `zkir/`**)
4. **Scan** — Trivy; high/critical block
5. **Push** — ECR
6. **Deploy** — Terraform plan/apply → ECS update
7. **Contracts** — separate manual workflow per network

Ownership: `roles/sre-devops.md`.
