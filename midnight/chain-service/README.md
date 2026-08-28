# chain-service

Node 22 + TypeScript sidecar wrapping Midnight.js. **FastAPI reaches Midnight only
through this service** — Midnight.js is TypeScript-only and Web3.py cannot talk to
Midnight at all.

## Start it (mock mode — available now)

```bash
docker compose up -d chain-service     # from the repo root
# or locally:
nvm use 22 && npm install && npm start
```

`CHAIN_MODE=mock` serves the **identical HTTP contract** with deterministic
fixtures. When live wiring lands, the mode flips and **nothing on your side
changes** — mock and live are two implementations of one interface behind the
same routes, schemas, and error mapping.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/chain/health` | node / indexer / proof-server reported **separately** |
| `POST` | `/chain/issue` | prove + submit `issue` |
| `POST` | `/chain/revoke` | prove + submit `revokeCredential` |
| `POST` | `/chain/prove` | verify; returns disclosed + withheld |
| `GET` | `/chain/state/:credentialId` | cheap indexer read, no proving |
| `POST` | `/chain/authorize-issuer` | onboard a university |

## Fixtures (mock mode)

| Credential ID | Behaviour |
|---|---|
| `ACAD-2026-000001` | VALID |
| `ACAD-2026-000002` | VALID, GPA disclosable |
| `ACAD-2026-000003` | REVOKED |
| `ACAD-2026-000004` | INVALID_PROOF (tampered) |
| `ACAD-2026-000005` | 503 `PROOF_MATERIAL_UNAVAILABLE` |
| anything else | 404 `NOT_FOUND` |

Send `X-Force-Error: CHAIN_UNAVAILABLE` (or any error code) on any request to
exercise failure states without faking them yourself.

```bash
curl -s localhost:8090/chain/prove -H 'Content-Type: application/json' \
  -d '{"credentialId":"ACAD-2026-000002","disclose":["gpa"]}'
```

## The one rule that matters

**`INVALID_PROOF` means the credential failed. `5xx` means *we* failed.**

Never render a 5xx as an invalid credential. Doing so accuses a real graduate of
forgery because a container ran out of memory. `503 PROOF_MATERIAL_UNAVAILABLE`
in particular means our witness vault is missing — it says nothing whatsoever
about the credential.

## Notes for consumers

- `credentialId` is the **human string** (`ACAD-2026-000123`) everywhere on the
  wire. This service converts it to `Bytes<32>` internally.
- `studentId` / `institutionId` / `issuerPk` are **64 lowercase hex chars**.
  This service never sees a name, a degree title, or an institution name —
  FastAPI owns those joins.
- `disclosed.gpaTimes100` is `null` when withheld, **never `0`** (a real 0.00 GPA
  must stay distinguishable).
- `proof.issuanceTxId` refers to **issuance**. Verification does not submit a
  transaction — publishing a verification would publish the disclosure. See
  `docs/api-spec.md`.

## Cut: the detachable ZK proof bundle (`proof.level: "zk-verified"`)

`ProveResult.proof.level` is typed as `"circuit-checked" | "zk-verified"`, but
every response today returns `"circuit-checked"` — nothing produces the second
value. This was an attempted stretch feature: verify a proof independently via
`@midnight-ntwrk/zkir-v2`'s `check()`, so a judge could take a bundle and check
it without trusting this service at all.

**Spiked and cut**, not abandoned by neglect — here's exactly where it stands,
so whoever picks it up next doesn't repeat the exploration:

- `zkir-v2` is already installed (2.1.0), has zero conflicting dependencies,
  and `check(serializedPreimage, keyMaterialProvider)` is the right function —
  confirmed from its own `.d.ts`. Circuit proof data is directly on the
  compact-runtime 0.16 circuit result as `result.proofData` (see
  `localProve.ts` and `test/contract/disclosure.test.ts` for how to read it).
- The proof server's `/check` HTTP endpoint is **not** a substitute — read
  its actual contract (`proof-server:proof-server-api` in the Midnight Expert
  plugin): it returns branch-omission/zero-padding metadata for transcript
  assembly, explicitly "not a per-constraint pass/fail validator." Real
  verification has to go through `zkir-v2` locally, or through the SDK's own
  `/prove`-based flow — not this endpoint.
- `check()`'s `KeyMaterialProvider.getParams(k)` needs the ZK trusted-setup
  parameters. **The host is real and public: `https://srs.midnight.network/`**
  — found directly in the proof server's own startup logs
  (`docker compose logs proof-server`, visible even without `-v`). No account,
  no auth; every proof server fetches from it on first boot.
- **Not resolved:** the exact per-`k` file path. Guessed patterns
  (`params_10.bin`, etc.) all return `403` (consistent with a gated object
  store, not a dead host). Tried extracting it from the wire by restarting a
  throwaway proof-server instance with `RUST_LOG=trace` — this binary does
  **not** appear to read `RUST_LOG` at all; verbosity is fixed by `-v` alone,
  and `-v` only logs the connection target (`reqwest::connect`), not the
  request path.
- Also found while spiking: the fetched material is **checksum-verified**
  against an expected value baked into the Rust binary ("Fetching public
  parameters for k=10 - finished." / "- verified correct."). Even with the
  right URL, replicating that verification (or trusting the bytes unverified)
  is a second, separate problem — this is deeper than a missing filename.

**If you pick this back up:** the fastest next step is almost certainly *not*
more log-level archaeology — try a TLS-intercepting proxy (`mitmproxy` on the
same Docker network, `HTTPS_PROXY` env var, since `reqwest` clients typically
honor it unless explicitly disabled), which would show the real request/response
including the exact path, in one shot.

Nothing about this cut affects any shipped behavior — `"fast"` mode
(`circuit-checked`) is the real, working privacy mechanism this project's ZK
guarantees already rest on. This only adds independent third-party
verifiability of a single proof artifact on top of it.
