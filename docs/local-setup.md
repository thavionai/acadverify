# AcadVerify — Local Development Setup

Steps 1–5 are for everyone. Step 6 is role-specific.
Versions and endpoints: `midnight-stack.md`.

## 1. Prerequisites

- **Docker Desktop** — allocate **4 GB+ RAM**; the Midnight devnet is three
  services and the proof server is memory-hungry
- **Git**
- **Node.js 22+** — Midnight tooling requires it; v20 will fail
- **Python 3.12+** — backend
- **Compact toolchain** — see step 3

```bash
docker --version && docker compose version
node --version        # must be >= 22
python3 --version
```

If Node is older than 22:

```bash
nvm install 22 && nvm alias default 22
```

## 2. Clone and branch

```bash
git clone https://github.com/thavionai/acadverify.git
cd acadverify
```

**Branch naming: `<yourname>-<area>`.** Six people share this repo, so every
branch carries its owner's name — `prajithravisankar-blockchain`,
`prajithravisankar-backend`, and so on. Never commit directly to `main`.

```bash
git checkout -b <yourname>-<area>
```

## 3. Install the Compact toolchain

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh

source ~/.zshrc                     # or restart the terminal
compact update --no-set-default 0.31.1
```

**Install 0.31.1 specifically, not the latest.** The compiler must emit the
runtime version the Midnight SDK is built against (0.16.0). Compiling with 0.34.0
produces a contract the SDK cannot execute, failing with an unrelated-looking
error deep inside `decodeZswapLocalState`. See `midnight-stack.md` §"Do not
upgrade these versions".

```bash
compact --version                            # 0.5.2  (tool manager)
compact compile +0.31.1 --language-version   # 0.23.0
```

The compiled output is **committed to the repo**, so you do not need to build it
to run anything. To rebuild after changing the contract:

```bash
cd midnight/chain-service && npm run compact   # → "Compiling 4 circuits:"
```

## 4. Install the Claude Code Midnight plugins

16 plugins / 88 skills of official Midnight reference material:

```bash
curl -fsSL https://midnightntwrk.expert/install.sh | bash
```

Then in Claude Code: `/reload-plugins`, then `/midnight-expert:doctor`.

The one you will use constantly:

```
/midnight-tooling:devnet start | status | health | logs | stop
```

## 5. Start the local environment

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

| Service | URL | Purpose |
|---|---|---|
| **Midnight node** | http://localhost:9944 | Substrate RPC — the chain |
| **Midnight indexer** | http://localhost:8088/api/v4/graphql | GraphQL chain state |
| **Proof server** | http://localhost:6300 | ZK proof generation |
| DynamoDB Local | http://localhost:8000 | stands in for AWS DynamoDB |
| MinIO (S3 API) | http://localhost:9000 | stands in for AWS S3 |
| MinIO console | http://localhost:9001 | `acadverify` / `acadverify123` |

The local network ID is `undeployed`.

**All three Midnight services must be up before anything works.** "The devnet"
is not one container — a green `docker compose ps` for the node alone means
nothing if the proof server is missing.

Health check:

```bash
curl -s -o /dev/null -w "node      %{http_code}\n" http://localhost:9944
curl -s -o /dev/null -w "indexer   %{http_code}\n" http://localhost:8088/api/v4/graphql
curl -s -o /dev/null -w "proof     %{http_code}\n" http://localhost:6300/health
```

Useful:

```bash
docker compose logs -f proof-server
docker compose down          # stop (data persists)
docker compose down -v       # stop and wipe (fresh start)
```

> The first proof-server start downloads ZK parameters and can take several
> minutes. It is not hung. Watch `docker compose logs -f proof-server`.

## 6. Role-specific first steps

### Blockchain (`<yourname>-blockchain`)

1. `midnight/contracts/academic_credential.compact` already compiles — start there.
2. Read `smart-contract.md`, then extend: tests, and the disclosure edge cases.
3. Deploy to the local devnet via the chain-service, then to `preview`
   (tDUST from the faucet).
4. Plugin skills: `compact-core:*`, `midnight-verify:*`, `midnight-cq:compact-testing`.

Reference implementation to crib from:

```bash
git clone https://github.com/midnightntwrk/example-hello-world.git
cd example-hello-world && yarn install && yarn test:local
```

### Chain-service — **already built**

```bash
cd midnight/chain-service
nvm use 22 && npm install
npm test          # 34 contract + API tests, no devnet needed
npm start         # CHAIN_MODE=mock on :8090
```

Against a live devnet:

```bash
npm run deploy    # deploys + authorizes the demo issuer, writes
                  # midnight/deployments/undeployed.json
npm run smoke     # full lifecycle: issue -> verify -> forge -> revoke
CHAIN_MODE=live npm start
```

See `midnight/chain-service/README.md`. Note the versions are pinned
deliberately — do not bump `compact-runtime`, `compact-js`, or `ledger-v8`
without reading `midnight-stack.md` first.

### Backend (`<yourname>-backend`)

```bash
mkdir backend && cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn boto3 qrcode pydantic-settings httpx pytest
```

**Do not install `web3`** — Web3.py cannot talk to Midnight. FastAPI reaches the
chain only through the chain-service over HTTP.

`uvicorn app.main:app --reload --port 8080` → http://localhost:8080/docs

### Frontend (`<yourname>-frontend`)

```bash
npx create-next-app@latest frontend --typescript --tailwind --eslint
cd frontend && npm i @midnight-ntwrk/dapp-connector-api
```

No ethers.js/viem. Build `/verify/[credentialId]` first against `api-spec.md`.
Plugin skill: `midnight-dapp-dev:dapp-connector`.

### DevOps (`<yourname>-devops`)

1. `scripts/bootstrap-local.sh` — create DynamoDB tables + MinIO bucket.
2. Pin the Midnight image versions in `docker-compose.yml`.
3. CI: `compact compile` must run in the pipeline, and the chain-service image
   must include `keys/` + `zkir/`.
4. Terraform per `deployment.md`.

### Product / QA (`<yourname>-docs`)

1. `data/` seed files: demo university, sample graduates, and one credential
   with **deliberately wrong witness data** to demonstrate that no proof can be
   generated for it.
2. E2E skeleton: issue → verify → revoke → re-verify.

## 7. Daily workflow

```bash
git checkout main && git pull
git checkout <yourname>-<area>
git merge main
# ...work, commit...
git push
# open a PR into main
```

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `compact: command not found` | `source ~/.zshrc`; installer writes to `~/.local/bin` |
| Contract won't compile, pragma error | Must be `>= 0.23` — use compiler `+0.31.1`, not the latest |
| Proof generation hangs or times out | Proof server is CPU-bound; raise Docker RAM, check `--num-workers` |
| Proof server 404s on startup | Still fetching ZK params — watch the logs, wait it out |
| `zkConfigProvider` errors | `keys/`/`zkir/` missing — rerun `npm run compact` |
| Chain-service can't reach services in Docker | Use service names (`http://proof-server:6300`), not `localhost` |
| DynamoDB "Up" but every call hangs | Fixed: the container needs `user: root` to write its volume |
| Devnet state gone after restart | Expected on `down -v` — redeploy the contract, update `CONTRACT_ADDRESS` |
| Port in use (9944/8088/6300/8000/9000) | Stop the conflicting process or change the host-side port |
