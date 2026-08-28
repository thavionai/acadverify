# AcadVerify — Local Development Setup (Docker)

Every team member follows steps 1–4 once. Step 5 is role-specific — jump to your section.

## 1. Prerequisites

Install on your machine:

- **Docker Desktop** (includes Docker Compose) — https://www.docker.com/products/docker-desktop
- **Git**
- **Node.js 22+** (frontend, chain-service, and Midnight tooling — Midnight requires v22+)
- **Python 3.12+** (backend tooling outside containers)
- **Compact compiler** (Midnight toolchain — see `midnight-integration.md`)
- A GitHub account with access to `thavionai/acadverify`

Verify:

```bash
docker --version
docker compose version
git --version
node --version
python3 --version
```

## 2. Clone the repository and set up branches

```bash
git clone https://github.com/thavionai/acadverify.git
cd acadverify
```

Create your role's feature branch from `develop` (create `develop` from `main` if it doesn't exist yet — one person does this once):

```bash
git checkout develop 2>/dev/null || git checkout -b develop && git push -u origin develop
```

Then each member:

| Role | Branch |
|---|---|
| Blockchain Engineer | `feature/blockchain` |
| Backend Engineer | `feature/backend` |
| Frontend Engineer | `feature/frontend` |
| SRE / DevOps | `feature/devops` |
| Product / QA | `feature/docs` |

```bash
git checkout develop
git checkout -b feature/<your-area>
git push -u origin feature/<your-area>
```

## 3. Environment variables

Copy the example env file (create `.env.example` on first setup; **never commit `.env`**):

```bash
cp .env.example .env
```

Local values (matching `docker-compose.yml`):

```env
# Local AWS stand-ins
DYNAMODB_ENDPOINT=http://localhost:8000
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=acadverify
S3_SECRET_KEY=acadverify123
S3_BUCKET=acadverify-dev
AWS_REGION=us-east-1

# Local chain (Hardhat node)
RPC_URL=http://localhost:8545
CHAIN_ID=31337
CONTRACT_ADDRESS=            # filled in after local deploy (step 5, blockchain)
ISSUER_PRIVATE_KEY=          # a Hardhat default account key — LOCAL ONLY, never a real key

# Backend
API_PORT=8080
```

Testnet keys (Polygon Amoy) come from AWS Secrets Manager for staging/production only — real private keys never go in `.env` or the repo.

## 4. Start the local environment

From the repo root:

```bash
docker compose up -d
docker compose ps        # everything should be "running"
```

This starts:

| Service | URL | Purpose |
|---|---|---|
| DynamoDB Local | http://localhost:8000 | stands in for AWS DynamoDB |
| MinIO (S3 API) | http://localhost:9000 | stands in for AWS S3 |
| MinIO console | http://localhost:9001 | browse buckets (login: `acadverify` / `acadverify123`) |

The `hardhat`, `backend`, and `frontend` services in `docker-compose.yml` are commented out until their folders are scaffolded (Phases 2–4 of the roadmap). **Uncomment each service as its code lands.**

Useful commands:

```bash
docker compose logs -f <service>   # follow logs
docker compose down                # stop everything (data persists in volumes)
docker compose down -v             # stop and wipe data (fresh start)
```

## 5. Role-specific first steps

### Blockchain Engineer (`feature/blockchain`)

**Primary target is now Midnight** — full steps in `docs/midnight-integration.md`. Quick start:

```bash
git clone https://github.com/midnightntwrk/example-hello-world.git
cd example-hello-world && yarn install
yarn env:up        # local devnet + proof server (Docker must be running)
yarn test:local    # compile, deploy, exercise the contract
```

1. Port the pattern into `midnight/` in our repo; implement `contracts/academic_credential.compact`.
2. `compact compile` generates the TS contract API + ZK keys the chain-service imports.
3. Deploy to local devnet, then Midnight testnet (tDUST from the faucet).
4. (Stretch, Cross-Chain track) the Hardhat/Solidity flow per `docs/smart-contract.md`.

### Backend Engineer (`feature/backend`)

```bash
mkdir backend && cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn web3 boto3 qrcode pydantic-settings pytest
```

1. Scaffold the FastAPI app per `docs/api-spec.md`; point boto3 at `DYNAMODB_ENDPOINT`/`S3_ENDPOINT` from `.env`.
2. Implement the SHA256 canonicalization module first (`docs/data-model.md`) — it's the contract with the chain.
3. Run locally: `uvicorn app.main:app --reload --port 8080`; Swagger at http://localhost:8080/docs.
4. Add a `Dockerfile`, then uncomment the `backend` service in `docker-compose.yml`.

### Frontend Engineer (`feature/frontend`)

```bash
npx create-next-app@latest frontend --typescript --tailwind --eslint
cd frontend && npm i ethers
```

1. Build the public verify page first (`/verify/[credentialId]`) against the API spec — mock the API until the backend endpoint is live at `http://localhost:8080/api/v1`.
2. Then the dashboard (issue form, list, revoke) per `docs/roles/frontend-engineer.md`.
3. Run: `npm run dev` → http://localhost:3000.
4. Add a `Dockerfile`, then uncomment the `frontend` service in `docker-compose.yml`.

### SRE / DevOps (`feature/devops`)

1. Create `.env.example` and this compose file's app-service Dockerfiles as they land.
2. Scaffold `infrastructure/terraform/` (state backend, ECR, ECS, DynamoDB, S3, CloudFront, Secrets Manager) per `docs/deployment.md`.
3. Scaffold `.github/workflows/`: lint/test per component, Docker build, Trivy scan, ECR push.
4. Write a script that creates the local DynamoDB tables and MinIO bucket (`scripts/bootstrap-local.sh`) so everyone's step 4 ends with ready-to-use storage.

### Product / QA (`feature/docs`)

1. Create `data/` seed files: one demo university, sample graduates, one deliberately tampered credential (per `docs/hackathon-plan.md`).
2. Write the demo script and acceptance criteria for Phase 2–4 deliverables.
3. Set up the e2e test skeleton (issue → verify → revoke → re-verify) to run against the local stack.

## 6. Daily workflow

```bash
git checkout develop && git pull          # start of day
git checkout feature/<your-area>
git merge develop                          # stay current
# ...work, commit...
git push
# open a PR: feature/<your-area> → develop
```

- PRs into `develop`; `develop` → `main` only for releases/demo freeze.
- Keep commits small; reference the roadmap phase in the PR description.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Port already in use (8000/9000/3000/8080/8545) | stop the conflicting local process, or change the host-side port in `docker-compose.yml` |
| Backend can't reach DynamoDB/MinIO from inside Docker | use the service names (`http://dynamodb:8000`, `http://minio:9000`), not `localhost` |
| Chain state gone after restart | Hardhat node is ephemeral — redeploy the contract and update `CONTRACT_ADDRESS` in `.env` |
| Fresh start needed | `docker compose down -v && docker compose up -d`, then rerun the bootstrap script |
