# AcadVerify — The Midnight Stack (Infrastructure Reference)

This is the **single source of truth for versions, endpoints, and component
names**. Every other doc links here instead of repeating them, so there is one
place to update when the ecosystem moves.

> **Provenance.** Every fact below was verified on 2026-08-28 against either
> (a) the locally installed Compact toolchain, (b) the official
> [Midnight Expert plugin suite](https://midnightntwrk.expert/) reference
> material, or (c) [docs.midnight.network](https://docs.midnight.network/).
> Items marked ✅ **verified locally** were confirmed by running the tool or
> compiling code on this repo — not read from a web page.

## 1. What Midnight actually is

Midnight is a **Substrate-based, privacy-preserving blockchain**. Three ideas
matter for AcadVerify:

| Concept | Meaning for us |
|---|---|
| **Compact** | The contract language. Compiles to ZK circuits **plus a TypeScript API**. Not Solidity, not EVM. |
| **Ledger / circuits / witnesses** | A contract splits into *public ledger state*, *circuits* (validated logic), and *witnesses* (private local data that never leaves the device). |
| **Proofs, not data** | A transaction carries a public transcript + a ZK proof. The chain stores a verifying key per circuit — not the data, not the logic. |

The consequence that reshapes this project: **we no longer put a hash of the
credential on-chain and compare it.** We put a *commitment* on-chain and prove
things about the credential in zero knowledge. The verifier learns only what the
student consented to reveal.

## 2. Component versions (verified)

| Component | Version | How verified |
|---|---|---|
| Compact developer tools (`compact` CLI) | **0.5.2** | ✅ `compact --version` |
| Compact compiler (toolchain) | **0.34.0** | ✅ `compact update` / `compact list` |
| Compact **language version** | **0.26.0** | ✅ `compact compile --language-version` |
| Compact runtime | **0.19.0** | ✅ emitted in `compiler/contract-info.json` |
| Midnight.js SDK (`@midnight-ntwrk/midnight-js-*`) | **4.1.1** (lockstep) | Midnight Expert `midnight-dapp-dev:midnight-sdk` |
| DApp Connector API | **4.0.1** | Midnight Expert `midnight-dapp-dev:dapp-connector` |
| Indexer | **4.3.3** | Midnight Expert `midnight-indexer:indexer-architecture` |
| Node.js | **22+** required | ✅ installed v22.23.2 |

> **Pragma:** contracts must declare `pragma language_version >= 0.26;`.
> An older pragma such as `>= 0.16` still compiles (it is a *minimum*) but
> signals a stale design — the syntax in those older docs has moved on.

All SDK packages are on the **public npm registry** under the `@midnight-ntwrk`
scope. Do not configure custom registries or `.npmrc` overrides.

## 3. Networks — say "Preview", not "testnet"

Midnight does not have a single thing called "testnet". Using the wrong name
will send someone to the wrong endpoint.

| Network ID | What it is | When we use it |
|---|---|---|
| `undeployed` | Local devnet on your machine | All development |
| `preview` | Public preview network | **Our demo target** |
| `preprod` | Pre-production | Not used for the hackathon |

`connect(networkId)` in the DApp Connector accepts exactly `"undeployed"`,
`"preview"`, or `"preprod"`.

## 4. The three local services

The local devnet is **not one service** — it is three, and all three must be
running before anything works.

| Service | Port | Endpoint | Role |
|---|---|---|---|
| **Node** | 9944 | `http://127.0.0.1:9944` | Substrate JSON-RPC; the chain itself |
| **Indexer** | 8088 | `http://127.0.0.1:8088/api/v4/graphql` | GraphQL for chain state + subscriptions |
| **Proof server** | 6300 | `http://127.0.0.1:6300` | Generates the ZK proofs |

The indexer also serves WebSocket subscriptions at
`ws://127.0.0.1:8088/api/v4/graphql/ws` (protocol `graphql-transport-ws`).

### Public network endpoints

| Network | Indexer HTTP | Indexer WebSocket |
|---|---|---|
| Local | `http://localhost:8088/api/v4/graphql` | `ws://localhost:8088/api/v4/graphql/ws` |
| Preview | `https://indexer.preview.midnight.network/api/v4/graphql` | `wss://indexer.preview.midnight.network/api/v4/graphql/ws` |
| Preprod | `https://indexer.preprod.midnight.network/api/v4/graphql` | `wss://indexer.preprod.midnight.network/api/v4/graphql/ws` |

### There is no PolygonScan

This is the single most common mistake when porting an EVM design. **Midnight
has no block explorer whose URL you can paste to prove a transaction.** The
equivalent is an **indexer GraphQL query** — `contractAction(address, offset)`
returns `ContractDeploy | ContractCall | ContractUpdate`. Anywhere the old
design said "explorer link", we render indexer-derived evidence instead. See
`api-spec.md`.

Indexer query limits: max complexity **200**, max depth **15**, request body
**1 MiB**.

## 5. Proof server

Image `midnightntwrk/proof-server:<version>`; pin the version that matches the
target network rather than tracking `latest`.

| Flag | Env var | Default |
|---|---|---|
| `-p`, `--port` | `MIDNIGHT_PROOF_SERVER_PORT` | `6300` |
| `--num-workers` | `MIDNIGHT_PROOF_SERVER_NUM_WORKERS` | `2` |
| `--job-capacity` | `MIDNIGHT_PROOF_SERVER_JOB_CAPACITY` | `0` (unlimited) |
| `--job-timeout` | `MIDNIGHT_PROOF_SERVER_JOB_TIMEOUT` | `600.0`s |
| `-v`, `--verbose` | `MIDNIGHT_PROOF_SERVER_VERBOSE` | `false` |

**Operational note that will bite us:** proving is CPU-heavy and the default is
only 2 workers with a 10-minute job TTL. Proof latency, not chain latency, is
the bottleneck in our issue and verify paths. Budget for it in the SLOs
(`deployment.md`) and demo (`hackathon-plan.md`).

## 6. Midnight.js SDK — the six providers

`MidnightProviders` bundles six required providers. The chain-service cannot
call a contract until all six are constructed.

| Provider | Package | Supplies |
|---|---|---|
| `walletProvider` | wallet SDK / DApp Connector | coin public key, `balanceTx` |
| `midnightProvider` | wallet SDK / DApp Connector | `submitTx` |
| `publicDataProvider` | `midnight-js-indexer-public-data-provider` | indexer queries + subscriptions |
| `proofProvider` | `midnight-js-http-client-proof-provider` | talks to the proof server |
| `zkConfigProvider` | `midnight-js-node-zk-config-provider` (Node) / `midnight-js-fetch-zk-config-provider` (browser) | loads `keys/` + `zkir/` |
| `privateStateProvider` | `midnight-js-level-private-state-provider` | LevelDB store for witness data |

Core contract operations come from `@midnight-ntwrk/midnight-js-contracts`:
`deployContract`, `findDeployedContract`, `submitCallTx`, `callTx`.
Network selection: `setNetworkId` from `@midnight-ntwrk/midnight-js-network-id`.

`privateStateProvider` is where a student's credential fields and salt live.
**It is the actual privacy boundary of this product** — if it leaks, the
commitments become openable. Treat it as key material, not as a cache.

## 7. Wallet

Browser: the **Lace wallet (Midnight edition)** via the DApp Connector API.
Wallets inject an `InitialAPI` under a per-wallet UUID key in `window.midnight`
(the API is CAIP-372-compatible). Lace also exposes a convenience alias at
`window.midnight.mnLace`, **but relying on that alone misses other wallets** —
enumerate `Object.values(window.midnight)` and match on `name`/`rdns`.

Node.js (our chain-service): `WalletFacade` from the wallet SDK, which supplies
both `walletProvider` and `midnightProvider`.

Funding: **tDUST** from the Midnight faucet for Preview.

## 8. Compact toolchain

```bash
# install the tool manager (one time)
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh

compact update                      # install/refresh the compiler toolchain
compact --version                   # tool manager version
compact compile --language-version  # language version the compiler accepts
```

Compiling a contract emits four directories — ✅ verified by compiling
`midnight/contracts/academic_credential.compact` in this repo:

| Output | Contents | Consumed by |
|---|---|---|
| `contract/` | `index.d.ts`, `index.js` — the TypeScript contract API | chain-service imports this directly |
| `keys/` | `<circuit>.prover`, `<circuit>.verifier` | proof server / verification |
| `zkir/` | `<circuit>.zkir`, `<circuit>.bzkir` | ZK intermediate representation |
| `compiler/` | `contract-info.json` — the public/private surface | audit + code generation |

`contract-info.json` is worth reading in review: it states, per circuit, exactly
what the *arguments* and *result type* are. That is the machine-checkable
statement of what a circuit can possibly reveal.

## 9. Compact cryptographic primitives

| Function | Signature | Hides input? | Clears witness taint? |
|---|---|---|---|
| `persistentCommit<T>` | `(value: T, rand: Bytes<32>) -> Bytes<32>` | **Yes** | **Yes** |
| `transientCommit<T>` | `(value: T, rand: Field) -> Field` | **Yes** | **Yes** |
| `persistentHash<T>` | `(value: T) -> Bytes<32>` | No (brute-forceable) | No |
| `transientHash<T>` | `(value: T) -> Field` | No | No |

`persistentHash` / `persistentCommit` are **SHA-256 based** and stable across
upgrades — use them for anything stored on the ledger or compared across
transactions. The `transient*` variants are cheaper in-circuit but must not be
persisted.

**The trap:** `persistentHash` is SHA-256, but it is SHA-256 over *Compact's
encoding of a typed value* — not over a UTF-8 JSON string. A SHA-256 computed
in Python over canonical JSON **will never equal** a `persistentHash` computed
in-circuit. See `data-model.md` §"Why the old SHA256 rule had to go".

### `disclose()`

Privacy is the default. The compiler's *Witness Protection Program* tracks
witness-derived values and refuses to let one cross a public boundary
undeclared. `disclose()` is a **compile-time annotation, not an operation** — it
does not encrypt or hash anything. It asserts "I intend this to be public."

Required at: ledger writes, ADT method arguments, conditionals containing ledger
writes, exported-circuit returns, cross-contract calls.
Not required for: pure in-circuit computation, internal circuit calls, or the
output of a `*Commit` function (committing already clears taint).

### Ledger ADTs

`Counter`, `Map<K,V>`, `Set<T>`, `List<T>`, `MerkleTree<N,T>`,
`HistoricMerkleTree<N,T>`. **All operations are publicly visible except
`MerkleTree.insert()`**, which stores `leaf_hash(value)` — the only ledger
operation that hides its argument. Membership proofs against a Merkle tree do
not reveal *which* leaf is being proven; `Set.member()` does.

## 10. Claude Code plugin suite (installed)

16 plugins / 88 skills from <https://midnightntwrk.expert/>, installed at user
scope. Run `/reload-plugins`, then `/midnight-expert:doctor`.

| Plugin | Use it for |
|---|---|
| `compact-core` | Language, ledger, witnesses, privacy/disclosure, security review |
| `compact-examples` | Curated example contracts |
| `compact-cli-dev` | Scaffolding Compact projects |
| `midnight-tooling` | **`/midnight-tooling:devnet`** — start/stop/health the 3-service devnet |
| `midnight-dapp-dev` | Midnight.js SDK + DApp Connector patterns |
| `midnight-wallet` | Wallet SDK, test wallets |
| `midnight-verify` | Verifying contract correctness (ZKIR inspection, type-check, execution) |
| `midnight-cq` | Linting, testing, CI for Compact and DApps |
| `midnight-status-codes` | Decoding error codes |
| `proof-server` / `midnight-indexer` / `midnight-node` | Component internals + APIs |
| `midnight-fact-check` | Checking claims before we put them in the pitch |
| `core-concepts` | ZK foundations, architecture, privacy patterns |

Useful during the build:

```
/midnight-tooling:devnet start      # start node + indexer + proof server
/midnight-tooling:devnet health     # verify all three respond
/midnight-expert:doctor             # diagnose the environment
```

## 11. Deliberate non-goals

- **No EVM in the primary path.** No Solidity, Hardhat, OpenZeppelin, ethers.js,
  Web3.py, or Polygon in the demo flow. They survive only in the Cross-Chain
  stretch (`smart-contract.md` appendix).
- **No on-chain PII, and no on-chain hash of PII either.** The ledger holds
  blinded commitments. A hash of a small field set is brute-forceable; a
  salted commitment is not.

## Resources

- Docs: <https://docs.midnight.network/>
- Install the toolchain: <https://docs.midnight.network/getting-started/installation>
- Compact language: <https://docs.midnight.network/compact>
- Example repo: <https://github.com/midnightntwrk/example-hello-world>
- Claude Code plugins: <https://midnightntwrk.expert/>
- Midnight Academy: <https://mlh.link/midnight-academy>
- Midnight for Developers (PDF): <https://mpc.midnight.network/hubfs/Midnight%20for%20Developers.pdf>
