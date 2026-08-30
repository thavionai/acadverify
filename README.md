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

## Demo

- 🎥 **Demo video (≤ 2 min):** _link coming — will be public_ <!-- TODO: paste YouTube/Loom URL before final submission (Sun 11:45 ET) -->
- 📦 **Repo:** https://github.com/thavionai/acadverify (public)
- 🧾 **Devpost:** _link coming_ <!-- TODO -->

**In one sentence:** *For* an employer *who* must confirm a candidate's degree
*without* receiving their student ID, grades, or the university's records, *we
prove* the credential is genuine and unrevoked — *without revealing* anything
the student did not consent to share.

**The loop the demo shows (twice):** university issues → student's QR →
employer scans `/verify/<credentialId>` → **VALID / REVOKED / INVALID_PROOF**
with the disclosed / withheld split.

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

# 6. Deploy to the local devnet and run it live
npm run deploy                    # writes midnight/deployments/undeployed.json
CHAIN_MODE=live npm start
```

### Test it

```bash
# Chain-service unit tests (disclosure, error mapping, tx submission)
cd midnight/chain-service && npm test               # 64 tests, 9 files

# End-to-end against the live local devnet
npm run smoke                                        # adapter-level, 11/11
npm run smoke:http                                   # over HTTP, 13/13
npm run check:salt-leak                              # salt never in a response/log, 6/6

# Backend + frontend
cd ../../backend && pytest                           # disclosure + error envelope
cd ../frontend && npx playwright test                # critical flow + live product
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

## Project Status & evidence

**Verified on the local devnet (2026-08-28 → 08-30):**

| Claim | Evidence |
|---|---|
| Contract compiles | `npm run compact` → `Compiling 4 circuits`, prover + verifier keys, TS API emitted |
| Selective disclosure is real | `proveCredential` returns exactly 4 fields; `studentId` is absent from the type itself |
| End-to-end proving | `smoke` 11/11 + `smoke:http` 13/13 against node + indexer + proof server |
| Unit tests | chain-service `vitest` **64/64** |
| Salt never leaks | `check:salt-leak` 6/6 on a real issuance |
| Measured proof latency | issuance ≈ 19 s (proof-bound); verification never touches the proof server |

Full table with dates: [docs/midnight-integration.md §5](docs/midnight-integration.md).

**Limitations (known, disclosed):**

- `credentialId` is revealed per verification, so a verifier can build an access
  log for one credential. We do **not** claim unlinkability. Remedy sketched in
  [docs/smart-contract.md](docs/smart-contract.md).
- Runs on the **local devnet** (`undeployed`). Not yet deployed to `preview`
  (needs faucet tDUST) — `midnight/deployments/preview.json` does not exist.
- The detachable ZK proof bundle (`proof.level: "zk-verified"`) was attempted
  and cut for time; see `midnight/chain-service/README.md`.
- Credentials issued **before student access existed** have no holder token and
  cannot open `/hold/...`. Issue a fresh one to see the graduate's side.
- Share grants live in a JSON file with no locking — demo-grade, single-process,
  the same posture as the institution profile store.
- The wallet is a **login only**: it is never asked to sign, and chain-service
  holds the derived issuer keys custodially.
- A share link minted with `revealGpa` on a **gradeless attestation** shows
  `0.00` on the public page. The holder page hides that button and reads the
  value as absent, but the chain has no "no grade" bit to distinguish the two.
- Attestations are issued **sequentially** — roughly 22 s each in live mode,
  hence the cap of 10. Revoking a degree does **not** revoke its attestations;
  the courses were still taken.
- The résumé checker compares against the **degree only**, not attestations.
- The student's email is used once and discarded, so there is **no resend**.
  A lost access link means reissuing the credential.

**Next step:** deploy to `preview` and publish the contract address.

**Prior work disclosure (Integrate Midnight track):** the *concept* and an
EVM-based design (SHA256 anchoring on Polygon) predate the event; **all code in
this repository was written during the hackathon** (first commit
2026-08-28 11:00 PT). Nothing from the EVM prototype is reused — Midnight is
not EVM-compatible.

---

## License

MIT.

## Acknowledgements

Built with [Midnight](https://docs.midnight.network/), Compact, Midnight.js,
Next.js, FastAPI, AWS, Terraform, Docker, and GitHub Actions.
