# AcadVerify — Midnight Integration Map

**What we take from Midnight, where each piece is used, and why it is the right
tool for that job.** Reference tables live in `midnight-stack.md`; system design
in `architecture.md`; circuits in `smart-contract.md`. This doc is the
justification layer that ties them together.

Track: **Integrate Midnight** (stretch: Cross-Chain).

---

## 1. Why this app needs Midnight specifically

Credential verification has a structural privacy problem that a normal
blockchain makes *worse*:

- To prove one fact ("I hold a Master's from NVU"), the standard flow discloses
  a whole document — grades, dates, course history.
- Putting credentials on a public ledger adds a permanent, correlatable record
  of every credential a person holds.
- Hashing does not save you. A credential is a handful of low-entropy fields:
  a name, a degree from a short list, a year, a GPA to two decimals. Anyone with
  the hash can enumerate candidates offline until one matches.

Midnight is the rare platform where the *verification itself* is the private
operation: the proof asserts the credential is valid without transmitting the
credential. That is not a feature we bolt on — it replaces the mechanism.

**The honest test of whether this belongs on Midnight:** could we do it with a
normal database and a signature? We could prove authenticity that way — but not
*selective disclosure against a public, tamper-proof issuer set that the verifier
does not have to trust us to report honestly*. That combination is what needs a
ZK chain.

---

## 2. What we use from Midnight

### Compact (contract language) — the core

`midnight/contracts/academic_credential.compact`. Not just "a contract in their
language" — three Compact features do real work for us:

| Feature | How AcadVerify uses it |
|---|---|
| **Witnesses** | Credential fields and the blinding salt are witness data. They enter the circuit as PLONK private inputs and never reach the chain. |
| **`persistentCommit`** | Produces the blinded, SHA-256-based commitment stored on-chain. Clears witness taint, so the compiler certifies the value hides its input. |
| **Disclosure analysis** | The compiler's Witness Protection Program refuses to let witness-derived data cross a public boundary without an explicit `disclose()`. **Privacy leaks become compile errors.** |

That last row is the one to emphasise to judges. Our privacy guarantee is not
"we were careful" — it is enforced by the type system at build time. A future
teammate cannot accidentally leak `studentId`; the code will not compile.

Reinforced by design: `proveCredential` returns a `DisclosedClaim` struct that
has no `studentId` field at all, so leaking the holder's identity is
unrepresentable rather than merely prohibited.

### Proof server — proving, and our main latency budget

Generates every ZK proof for issuance, revocation, and verification. Runs
locally in Docker (:6300) and self-hosted in every deployed environment.

It is CPU-bound with 2 workers by default, which makes it — not block time —
the latency-determining component of the product. This reshapes the SLOs
(`deployment.md`) and is the top demo-day risk (`hackathon-plan.md`).

### Indexer — chain reads and independent verification

GraphQL on :8088 (`/api/v4/graphql`), plus WebSocket subscriptions. Used for:

- Reading contract state (does the credential exist? is it revoked?)
- Confirming a submitted transaction
- **Independent verification by third parties.** Midnight has no PolygonScan, so
  "show me the transaction" becomes a `contractAction(address)` query anyone can
  run against `indexer.preview.midnight.network`. The verify page surfaces a
  copyable query instead of a dead explorer link.

### Midnight node — the chain

Substrate RPC on :9944. The chain-service submits transactions through it; the
indexer follows it over WebSocket.

### Midnight.js SDK (v4.1.1) — the chain-service

`@midnight-ntwrk/midnight-js-*` in a Node 22 sidecar, with all six providers
wired (`midnight-stack.md` §6).

**Why a sidecar at all:** Midnight.js is TypeScript-only. There are no Python
bindings, so the original Web3.py integration cannot be ported — it has no
Midnight equivalent to port *to*. FastAPI keeps REST, metadata, QR, and storage;
anything requiring a proof goes over HTTP to the chain-service. This is a
platform constraint, not a design preference, and it is the single biggest
structural change to the backend.

The SDK's `privateStateProvider` (LevelDB) holds the witness data. It is the
actual privacy boundary of the deployed system — see `data-model.md`.

### DApp Connector + Lace wallet — the stretch

`@midnight-ntwrk/dapp-connector-api` v4.0.1. MVP has the platform generate
proofs. The stretch moves proving into the student's **Lace wallet (Midnight
edition)**, so the platform never holds the witness data at all.

Worth stating precisely in the pitch: **the contract is already agnostic about
who supplies the witness.** Platform custody is a deployment choice we made for
time, not a limitation of the design. Enumerate `Object.values(window.midnight)`
to detect wallets rather than assuming `mnLace`.

### Networks

Develop on `undeployed` (local devnet), demo on **`preview`**, funded with
tDUST from the faucet. "Testnet" is not a Midnight network name — using it sends
people to the wrong endpoint.

---

## 3. Claude Code plugin suite — how we use it

16 plugins / 88 skills from <https://midnightntwrk.expert/>, installed at user
scope (`curl -fsSL https://midnightntwrk.expert/install.sh | bash`).

These are **authoritative reference material**, and using them is how this
project avoided shipping several plausible-looking mistakes. Concretely, the
plugin reference is what caught:

| What the generic design said | What the plugins established | Consequence if missed |
|---|---|---|
| `pragma language_version >= 0.16` | Current is `>= 0.26`; compiler 0.34.0 | Stale syntax, confusing errors |
| Deploy to "testnet" | Networks are `undeployed` / `preview` / `preprod` | Wrong endpoints, lost time |
| Link to a block explorer | No explorer exists; use indexer GraphQL | A demo feature that cannot be built |
| `Set` for private membership | `Set.member` reveals the element; `MerkleTree` hides it | Overclaiming privacy to judges |
| SHA256 of canonical JSON as the chain contract | Commitment computed in-circuit over Compact's encoding | **Every verification fails, cause non-obvious** |

Day-to-day commands:

```
/midnight-tooling:devnet start|status|health|logs   # the 3-service local network
/midnight-expert:doctor                             # environment diagnostics
/midnight-verify:verify-compact                     # verify contract correctness
/midnight-status-codes:status-codes-lookup          # decode an error code
/midnight-fact-check:*                              # check claims before the pitch
```

Per-role skills are listed in each `roles/*.md`.

> **MCP note.** The plugin suite ships skills and agents for Claude Code, not an
> MCP server — nothing needs adding to `.mcp.json`. Some skills (e.g.
> `midnight-tooling:release-notes`) can call octocode MCP tools to fetch live
> release notes from `midnightntwrk/midnight-docs` when that server is
> configured; everything else works from the bundled reference material offline.

---

## 4. What we deliberately dropped

| Dropped | Why |
|---|---|
| Solidity / Hardhat / OpenZeppelin | Midnight is not EVM. Retained only in the Cross-Chain appendix. |
| Web3.py | No Python bindings for Midnight. Replaced by the chain-service. |
| ethers.js / viem | No EVM in the primary path. Replaced by the DApp Connector. |
| Polygon Amoy, `RPC_URL`, `CHAIN_ID` | Superseded by `MIDNIGHT_NETWORK_ID` + node/indexer/proof-server URLs. |
| `documents/<id>.json` in S3 | It was the hash pre-image; that is now witness data and must not be in shared storage. |
| On-chain issuer address, metadata URI, timestamp | Three correlatable identifiers per student, none of them necessary. |
| The `TAMPERED` state | Forgery is now unprovable rather than detectable. Folded into `INVALID_PROOF`. |

---

## 5. Verification status of this integration

Verified locally on 2026-08-28:

| Claim | Evidence |
|---|---|
| Contract compiles | ✅ 4 circuits, prover+verifier keys, TS API emitted |
| Selective disclosure is real | ✅ `contract-info.json` records `proveCredential`'s result as exactly 4 fields; `studentId` absent |
| Toolchain versions | ✅ `compact` 0.5.2, compiler 0.34.0, language 0.26.0, runtime 0.19.0 |
| Devnet runs | ✅ node + indexer + proof server all responding |
| Indexer serves real data | ✅ `{ block { height hash } }` returned a block from the local chain |
| Image tags exist | ✅ node 0.22.5, indexer-standalone 4.2.1, proof-server 8.1.0 |

Not yet verified (Phase 2): deployment to devnet or `preview`, end-to-end
proving through the chain-service, and real proof latency. **Do not claim these
in the submission until they run.**

---

## 6. 48-hour plan

| When | What |
|---|---|
| **Fri** | Everyone registers on Devpost. Contract tests started; chain-service skeleton + provider wiring; FastAPI ↔ chain-service API agreed; compose pinned. |
| **Sat AM** | Contract deployed to local devnet; issue/revoke/prove exercised end-to-end. |
| **Sat PM** | FastAPI issue → commitment on devnet; verify returns a proof-checked result; frontend renders disclosed/withheld. |
| **Sat EVE** | Deploy to **`preview`** (tDUST). End-to-end on preview. Selective-disclosure path working. **Feature freeze.** |
| **Sun 08:00** | Rehearse twice on the demo machine. Record a backup video. |
| **Sun 10:00 ET** | **Initial Devpost submission** — do not wait for polish. |
| **Sun 11:45 ET** | **Final submission.** |

## Resources

- <https://docs.midnight.network/>
- <https://midnightntwrk.expert/>
- <https://github.com/midnightntwrk/example-hello-world>
- Midnight Academy: <https://mlh.link/midnight-academy>
- Midnight for Developers (PDF): <https://mpc.midnight.network/hubfs/Midnight%20for%20Developers.pdf>
