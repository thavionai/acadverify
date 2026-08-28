# AcadVerify — Midnight Integration

Target event: **MLH Midnight Virtual Hackathon**, Aug 28–30, 2026.
Submissions via Devpost — **initial due Sunday 10:00 AM ET, final due Sunday 11:45 AM ET.**

## Track choice

| Track | Fit |
|---|---|
| **Integrate Midnight** ✅ primary | "Add Midnight privacy features to existing applications" — AcadVerify is the existing app; Midnight becomes its privacy layer |
| **Cross-Chain** (stretch) | "Midnight holds the private logic and generates the proofs" — keep the Polygon/EVM public anchor from the original design, move private verification to Midnight |

## Why Midnight upgrades AcadVerify

The original design proves a credential is *authentic* but the verifier still sees the credential data. Midnight's zero-knowledge model lets us prove *validity without disclosure*:

- An employer verifies "this person holds a valid, non-revoked Master's degree from an authorized university" **without seeing GPA, transcript details, or anything the student didn't consent to share**.
- Selective disclosure: the student chooses which fields the proof reveals (degree yes, GPA no).
- Nothing sensitive ever goes on-chain — not even hashes of PII. The ledger holds commitments and revocation flags; the proof does the rest.

This is the demo money-shot: two verifications of the same credential, one revealing only "valid Master's degree, issuer verified", one additionally disclosing GPA — both cryptographically checked against the same on-chain record.

## How Midnight works (what the team needs to know)

- Contracts are written in **Compact**, a TypeScript-based language that compiles to zero-knowledge circuits. Compilation produces the ZK proving/verifying keys **and a TypeScript API** for the contract.
- A contract splits into: **public ledger state** (on-chain, visible), **circuits** (the validated logic), and **witnesses** (private data supplied locally, never published).
- A transaction carries a public transcript + a ZK proof that the rules were followed. The chain stores a verifying key per contract function — not the data, not the logic.
- **MidnightJS** (TypeScript) is the dApp SDK; the **Lace wallet (Midnight edition)** signs transactions; a local **proof server** (Docker) generates proofs; testnet funds are **tDUST** from the Midnight faucet.

## Architecture changes

```
Before (EVM):                          After (Midnight):

FastAPI ──Web3.py──▶ Polygon           FastAPI ──HTTP──▶ chain-service (Node/TS, MidnightJS)
                                                             │        │
                                                        proof server  └──▶ Midnight testnet
                                                        (Docker)           (Compact contract)
```

1. **New `midnight/` folder** — the Compact contract, compiled artifacts, and the TypeScript chain-service.
2. **Chain-service sidecar (Node 22+, TypeScript)** — MidnightJS has no Python bindings, so Web3.py cannot talk to Midnight. FastAPI keeps owning REST/metadata/QR (DynamoDB, S3 unchanged) and calls the chain-service over HTTP for issue / revoke / verify-proof operations. The chain-service talks to the proof server and the Midnight network.
3. **Proof server** — runs as a Docker container locally (added to `docker-compose.yml`); generates the ZK proofs for transactions.
4. **Frontend** — the public verify page consumes proof results from the backend as before. Stretch: Lace wallet integration so a *student* can generate a disclosure proof client-side without the platform in the loop.
5. **The Solidity design (`smart-contract.md`) is retained** as the Cross-Chain stretch: Polygon keeps the public existence anchor, Midnight holds private logic and proofs.

## Compact contract sketch

Design sketch for `midnight/contracts/academic_credential.compact` — validate against the current compiler and the [hello-world example](https://github.com/midnightntwrk/example-hello-world) before relying on syntax:

```
pragma language_version >= 0.16;
import CompactStandardLibrary;

// Public ledger state — commitments only, never credential data
export ledger issuers: Set<Bytes<32>>;                      // authorized issuer ids
export ledger credentials: Map<Bytes<32>, Bytes<32>>;       // credentialId -> commitment
export ledger revoked: Set<Bytes<32>>;                      // revoked credentialIds

// Issue: issuer commits to the credential without revealing it.
// commitment = hash(credentialFields, salt) computed in-circuit from witness data.
export circuit issue(credentialId: Bytes<32>): [] { ... }

// Revoke: only the issuing university's key can revoke.
export circuit revoke(credentialId: Bytes<32>): [] { ... }

// Prove validity: witness = full credential fields + salt (held by student/platform).
// Circuit proves: commitment matches, issuer is authorized, not revoked,
// and reveals ONLY the fields the holder consented to disclose.
export circuit proveCredential(credentialId: Bytes<32>,
                               disclosed: DisclosedFields): [] { ... }

// Witnesses (private, local-only)
witness credentialFields(): CredentialData;
witness salt(): Bytes<32>;
```

Compiling (`compact compile`) generates `contract/` (TS API), `keys/` (proving/verifying keys), and `zkir/` — the chain-service imports the generated TS API directly.

## Local development setup (delta to `local-setup.md`)

Prerequisites on top of the existing list:

- **Node.js v22+** (Midnight tooling requires it — note our repo standard was 20+, bump to 22)
- **Compact compiler** (Midnight toolchain — see [docs.midnight.network](https://docs.midnight.network/))
- Docker (already required) for the **proof server / local devnet**

Fastest start — clone the official example and adapt:

```bash
git clone https://github.com/midnightntwrk/example-hello-world.git
cd example-hello-world
yarn install
yarn env:up        # starts local devnet + proof server (Docker must be running)
yarn test:local    # compiles, deploys to local devnet, runs contract ops
```

Then port the pattern into `midnight/` in our repo:

```
midnight/
├── contracts/academic_credential.compact
├── contracts/managed/            # compact compile output (contract/, keys/, zkir/)
├── chain-service/                # Node/TS HTTP service wrapping MidnightJS
└── package.json
```

The local devnet ships pre-funded wallets; for the public testnet, get **tDUST** from the Midnight faucet and use the **Lace wallet (Midnight edition)**.

## 48-hour plan (deadline-driven)

| When | What |
|---|---|
| **Fri (today)** | Everyone: register on Devpost. Blockchain: run hello-world end-to-end, start `academic_credential.compact`. Backend: scaffold chain-service HTTP skeleton + agree its API with FastAPI. DevOps: proof server in compose, Node 22 bump. |
| **Sat morning** | Contract compiles + deploys to local devnet; issue/revoke circuits pass tests. |
| **Sat afternoon** | Chain-service wired: FastAPI issue → commitment on devnet; verify returns proof-checked result. Frontend renders the privacy-preserving verify states. |
| **Sat evening** | Deploy contract to Midnight **testnet** (tDUST funded). End-to-end on testnet. Selective-disclosure demo path working. **Feature freeze.** |
| **Sun 8:00 AM** | Rehearse demo twice; record backup video. |
| **Sun 10:00 AM ET** | **Initial Devpost submission** (don't wait for polish). |
| **Sun 11:45 AM ET** | **Final submission.** |

Cut order if behind: selective disclosure → keep single "valid/revoked, nothing revealed" proof. Lace wallet flow → platform-generated proofs only. Testnet → demo on local devnet with honesty about it.

## Verification states (updated semantics)

| State | Meaning on Midnight |
|---|---|
| **VALID** | ZK proof verified: commitment matches, issuer authorized, not revoked |
| **REVOKED** | credentialId present in the on-chain revoked set |
| **TAMPERED / INVALID PROOF** | proof failed — witness data doesn't match the on-chain commitment |
| **Service error** | proof server / node unreachable — never rendered as an invalid credential |

## Resources

- Docs: https://docs.midnight.network/
- Hello-world tutorial: https://docs.midnight.network/getting-started/hello-world
- Compact language: https://docs.midnight.network/compact
- How contracts work: https://docs.midnight.network/concepts/how-midnight-works/smart-contracts
- Example repo: https://github.com/midnightntwrk/example-hello-world
- Event: https://events.mlh.com/events/14510-midnight-hackathon-august
