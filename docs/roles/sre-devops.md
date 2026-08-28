# SRE / DevOps Engineer

## Mission

Keep AcadVerify reliable, secure, and deployable — including three Midnight
services that did not exist in the original architecture, and one data store
whose loss is unrecoverable.

## Owns

- Docker Compose (5 local services), Dockerfiles
- **Midnight infrastructure**: proof server, indexer, node deployment + sizing
- **Private state store**: encrypted volume, backups, restore tests
- AWS (ECS Fargate, ECR, S3, DynamoDB, CloudFront, CloudWatch, Secrets Manager)
- Terraform, GitHub Actions, Trivy

## Responsibilities

- Keep the local stack working for five other people: node, indexer, proof
  server, DynamoDB Local, MinIO. **Pin the Midnight image versions** — the three
  services must be version-compatible with each other and the target network.
- **Size and operate the proof server.** It is CPU-bound, defaults to 2 workers,
  and is the latency-determining component of the entire product. Tune
  `--num-workers` to vCPU and set a real `--job-capacity` in production so a
  spike sheds load instead of exhausting memory. Never expose it publicly.
- **Own the private state volume.** It holds credential salts. Lost → those
  credentials can never be proven again; leaked → their commitments become
  openable. Encrypted volume, encrypted tested backups, scoped access, never an
  ephemeral filesystem. A stateless multi-replica chain-service without a shared
  encrypted store will silently lose credentials as tasks recycle.
- Build CI: **`compact compile` must run in the pipeline**, the chain-service
  image must contain `keys/` + `zkir/`, and a diff in
  `compiler/contract-info.json` must be surfaced as a reviewed privacy change.
- Manage secrets in Secrets Manager: Midnight **seeds** (not EVM private keys),
  issuer API keys, contract addresses per network.
- Build observability for what actually breaks: proof duration and queue depth,
  proof failure rate, `PENDING_PROOF` age, indexer latency, per-service health.
  **Alarm on the three Midnight services separately** — "the chain is down" is
  not actionable when the node is fine and the proof server is saturated.
- Treat a credential field or salt appearing in logs as a **P0 incident**, not a
  hygiene issue.
- Maintain runbooks for every alarm.

## Branch

`<yourname>-devops`

## Plugin skills

`midnight-tooling:devnet`, `midnight-tooling:devnet-health`,
`proof-server:proof-server-configuration`, `proof-server:proof-server-operations`,
`midnight-indexer:indexer-operations`, `midnight-node:node-operations`,
`midnight-cq:quality-init`

## Interfaces

- **Chain-service** ([chain-service-engineer.md](chain-service-engineer.md)):
  private-state volume, proof-server sizing, image contents.
- **Blockchain** ([blockchain-engineer.md](blockchain-engineer.md)): contract
  deploy workflow, seed custody.
- **Backend / Frontend**: health checks, images, CDN.
- **Product/QA** ([product-qa.md](product-qa.md)): environments, release gates.

## Definition of done

- Infrastructure changes are in Terraform and peer-reviewed.
- Midnight image versions are pinned and verified to exist.
- New services ship with health checks, a dashboard, and a meaningful alarm.
- Private state backup/restore has been *tested*, not just configured.
- Runbooks exist for every alarm that can page someone.
