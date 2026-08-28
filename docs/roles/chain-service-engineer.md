# Chain-Service Engineer (Midnight.js)

> **New role for the Midnight build.** It exists because Midnight.js is
> TypeScript-only: there are no Python bindings, so FastAPI cannot talk to
> Midnight directly. This service is the bridge, and it owns the most
> safety-critical state in the system.

## Mission

Own `midnight/chain-service/`: the Node 22 + TypeScript service that turns REST
calls into ZK proofs and Midnight transactions.

## Owns

- Midnight.js SDK v4.1.1 integration and all six providers
- Proof server and indexer connections
- **The private state store** (credential fields + salts)
- Contract deployment scripts
- The internal HTTP API consumed by FastAPI (`../api-spec.md`)

## Responsibilities

- Wire all six `MidnightProviders` (`../midnight-stack.md` §6). Nothing works
  until every one is constructed — this is the most common early blocker.
- Load the compiled contract API, `keys/`, and `zkir/` via the
  `zkConfigProvider`. **Ship these in the Docker image** — a container without
  them builds fine and fails at the first proof.
- Implement `/chain/issue`, `/chain/revoke`, `/chain/prove`,
  `/chain/state/{id}`, `/chain/health`.
- **Guard the private state store.** It holds credential fields and salts:
  lost → those credentials can never be proven again; leaked → their commitments
  become openable. Encrypted volume, tested restores, never an ephemeral
  container filesystem. Treat it as key material, not a cache.
- Generate a fresh random `Bytes<32>` salt per credential. Never reuse one;
  never log one; never return one in an API response.
- Set the network with `setNetworkId` before constructing providers.
- Surface honest errors: proof-server timeout is `PROOF_SERVICE_UNAVAILABLE`,
  never `INVALID_PROOF`. **Confusing those two accuses a real graduate of
  forgery because a container ran out of memory.**
- Report the three Midnight services separately in `/chain/health`.

## Branch

`<yourname>-chainservice`

## Plugin skills

`midnight-dapp-dev:midnight-sdk`, `midnight-dapp-dev:core`,
`proof-server:proof-server-integration`, `midnight-indexer:indexer-graphql-api`,
`midnight-wallet:wallet-sdk`, `midnight-cq:dapp-testing`

## Interfaces

- **Blockchain** ([blockchain-engineer.md](blockchain-engineer.md)): consumes
  the compiled contract API + keys; jointly owns the witness shape.
- **Backend** ([backend-engineer.md](backend-engineer.md)): owns the HTTP
  contract between the two services.
- **SRE/DevOps** ([sre-devops.md](sre-devops.md)): private-state volume,
  backups, proof-server sizing.

## Definition of done

- Every endpoint has a test against a local devnet.
- Salt handling has an explicit test proving salts never appear in responses or
  logs.
- Proof failures and service failures are distinguishable in the API and in logs.
- The Docker image is verified to contain `keys/` and `zkir/`.
