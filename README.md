# 🎓 AcadVerify

> **Privacy-Preserving Academic Credential Verification on [Midnight](https://midnight.network/)**

AcadVerify lets universities issue tamper-proof academic credentials, and lets
employers verify them in seconds from a QR code — **via a zero-knowledge proof
that reveals only what the student consented to share.**

Not even a hash of personal data touches the chain. And a forged credential
isn't *caught* — it simply **cannot produce a proof at all**.

Built for the **MLH Midnight Hackathon** (Aug 28–30, 2026) · Track:
**Integrate Midnight**.

---

## What Midnight changes

AcadVerify began as a conventional EVM credential-anchoring app. Moving it to
Midnight did not just swap the chain — it changed what a verification reveals:

| | Before (EVM design) | After (Midnight) |
|---|---|---|
| On-chain per credential | SHA256 hash + issuer address + metadata URI + timestamp | one blinded commitment |
| Verifier learns | every field in the credential document | only the consented fields |
| Forged credential | detected after the fact via hash mismatch | **unprovable** — no proof exists |
| Brute-force risk | real: low-entropy fields, salt printed in the QR | none: blinded commitment |
| Erasure | hash persists, "unlinkable" but brute-forceable | delete the salt → permanently unopenable |

The privacy guarantee is enforced by the compiler, not by discipline: Compact's
disclosure analysis turns a leak of witness data into a **build error**, and
`proveCredential` returns a struct that has no field for the student's identity
at all.

---

## Documentation

| Document | Contents |
|---|---|
| [Midnight Stack](docs/midnight-stack.md) | **Start here** — verified versions, endpoints, components, plugins |
| [Local Setup](docs/local-setup.md) | Get running: toolchain, devnet, role-specific first steps |
| [Architecture](docs/architecture.md) | Problem, solution, system design, trust model |
| [Midnight Integration](docs/midnight-integration.md) | What we use from Midnight and why |
| [Smart Contract](docs/smart-contract.md) | The Compact contract, circuits, privacy trade-offs |
| [Data Model](docs/data-model.md) | Commitments, witnesses, what may never go on-chain |
| [API Specification](docs/api-spec.md) | REST endpoints, verification states, error semantics |
| [Deployment](docs/deployment.md) | Proof server ops, private state, AWS, CI/CD |
| [Hackathon Plan](docs/hackathon-plan.md) | Roadmap, demo storyline, risks |
| [Team Roles](docs/roles/) | Ownership per role |

### Team roles

- [Blockchain Engineer](docs/roles/blockchain-engineer.md) — Compact contract
- [Chain-Service Engineer](docs/roles/chain-service-engineer.md) — Midnight.js
- [Backend Engineer](docs/roles/backend-engineer.md) — FastAPI
- [Frontend Engineer](docs/roles/frontend-engineer.md) — Next.js
- [SRE / DevOps](docs/roles/sre-devops.md) — infra, proof server, CI
- [Product / QA](docs/roles/product-qa.md) — docs, tests, demo

---

## Quick start

```bash
# 1. Node 22+ (Midnight requires it)
nvm install 22

# 2. Compact toolchain
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source ~/.zshrc && compact update

# 3. Midnight plugins for Claude Code (16 plugins, 88 skills)
curl -fsSL https://midnightntwrk.expert/install.sh | bash

# 4. Local stack: Midnight node + indexer + proof server, DynamoDB, MinIO
cp .env.example .env
docker compose up -d

# 5. Build the contract
cd midnight/chain-service && npm run compact
# = compact compile +0.31.1 ../contracts/academic_credential.compact \
#                          ./managed/academic_credential
```

Full details, including troubleshooting: [docs/local-setup.md](docs/local-setup.md).

---

## Repository Structure

```
acadverify/
├── midnight/
│   ├── contracts/
│   │   └── academic_credential.compact    # the Compact contract
│   ├── chain-service/                     # Node 22 + Midnight.js sidecar
│   └── deployments/                       # contract address per network
├── backend/                               # FastAPI
├── frontend/                              # Next.js
├── infrastructure/                        # Terraform, Docker, K8s
├── docs/
├── data/                                  # seed + demo fixtures
├── scripts/
└── .github/workflows/
```

---

## Stack

**Chain / privacy** — Compact 0.31.1 (language 0.23.0, runtime 0.16.0) · Midnight proof server ·
indexer (GraphQL) · Midnight node · networks `undeployed` → `preview`

**Chain-service** — Node 22 · TypeScript · Midnight.js SDK 4.1.1
(`@midnight-ntwrk/*`)

**Backend** — FastAPI (Python) · DynamoDB · S3

**Frontend** — Next.js · React · TypeScript · TailwindCSS · DApp Connector
(Lace wallet)

**Cloud / DevOps** — Docker · AWS ECS Fargate · Terraform · GitHub Actions · Trivy

> No Solidity, Hardhat, ethers.js, Web3.py, or Polygon in the primary path.
> Midnight is not EVM, and Midnight.js has no Python bindings — those are
> retained only for the optional Cross-Chain stretch.

---

## Contributing

Branch convention: **`<yourname>-<area>`** — six people share this repo, so
every branch carries its owner's name.

```bash
git checkout -b prajithravisankar-backend
# ...work, commit...
git push -u origin prajithravisankar-backend
# open a PR
```

---

## Project Status

🚧 **Hackathon MVP — active development.**

Verified working: Compact toolchain, the contract (4 circuits, keys, TS API),
and the full local devnet (node + indexer + proof server responding).
Not yet done: deployment to `preview`, end-to-end proving through the
chain-service. See [docs/midnight-integration.md](docs/midnight-integration.md) §5
for the current verification status — and don't claim more than that list.

---

## License

MIT.

## Acknowledgements

Built with [Midnight](https://docs.midnight.network/), Compact, Midnight.js,
Next.js, FastAPI, AWS, Terraform, Docker, and GitHub Actions.
