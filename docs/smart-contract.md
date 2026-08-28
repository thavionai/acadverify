# AcadVerify — Contract Design (Compact / Midnight)

**Primary contract:** `midnight/contracts/academic_credential.compact`
**Status:** ✅ compiles with Compact **0.34.0** (language **0.26.0**, runtime
**0.19.0**) — 4 circuits, prover + verifier keys, and a TypeScript API emitted.

Versions and toolchain: `midnight-stack.md`. Data rules: `data-model.md`.
The retired Solidity design is preserved in the appendix as the Cross-Chain
stretch only.

```bash
compact compile midnight/contracts/academic_credential.compact \
                midnight/contracts/managed/academic_credential
```

## Responsibilities

- Authorize university issuers
- Issue a credential as a blinded commitment
- Revoke a credential
- Prevent duplicates
- **Prove validity in zero knowledge, revealing only consented fields**

The last one is new, and it is the reason this project belongs on Midnight.

## Ledger state

```compact
export ledger issuers: Set<Bytes<32>>;                  // authorized issuer public keys
export ledger credentials: Map<Bytes<32>, Bytes<32>>;   // credentialId -> commitment
export ledger revoked: Set<Bytes<32>>;                  // revoked credentialIds
export sealed ledger platformOwner: Bytes<32>;          // set once at deployment
```

## Witnesses (private, never published)

```compact
witness localSecretKey(): Bytes<32>;
witness credentialFields(): CredentialData;
witness credentialSalt(): Bytes<32>;
```

## Types

```compact
export struct CredentialData {          // witness only — never on the ledger
  studentId: Bytes<32>,
  issuerPk: Bytes<32>,
  institutionId: Bytes<32>,
  degreeCode: Uint<32>,
  graduationYear: Uint<16>,
  gpaTimes100: Uint<16>
}

export struct DisclosedClaim {          // the ONLY thing a verification reveals
  institutionId: Bytes<32>,
  degreeCode: Uint<32>,
  graduationYear: Uint<16>,
  gpaTimes100: Uint<16>
}
```

`DisclosedClaim` has no `studentId` field. That is a deliberate design choice
rather than a runtime check: **the type system makes leaking the holder's
identity unrepresentable**, so no future edit to the circuit body can
accidentally introduce it. Verified in the emitted `contract-info.json`, which
records `proveCredential`'s result type as exactly these four fields.

## Circuits

| Circuit | Caller | Effect |
|---|---|---|
| `authorizeIssuer(issuerPk)` | platform owner | adds a university to `issuers` |
| `issue(credentialId)` | authorized issuer | writes `credentialId -> commitment` |
| `revokeCredential(credentialId)` | authorized issuer | adds to `revoked` |
| `proveCredential(credentialId, revealGpa)` | holder / platform | returns `DisclosedClaim` |

### Issuance

```compact
export circuit issue(credentialId: Bytes<32>): [] {
  const pk = publicKey(localSecretKey());
  assert(issuers.member(disclose(pk)), "issuer not authorized");
  assert(!credentials.member(disclose(credentialId)), "duplicate credential");
  const commitment = persistentCommit<CredentialData>(credentialFields(), credentialSalt());
  credentials.insert(disclose(credentialId), commitment);
}
```

The credential fields enter the circuit as witness data and leave as a single
32-byte commitment. `persistentCommit` clears witness taint, which is why the
commitment can be written to the ledger without a `disclose()` wrapper — the
compiler has proven the value cryptographically hides its input.

### Verification — the money shot

```compact
export circuit proveCredential(credentialId: Bytes<32>, revealGpa: Boolean): DisclosedClaim {
  const fields = credentialFields();
  const commitment = persistentCommit<CredentialData>(fields, credentialSalt());
  assert(credentials.member(disclose(credentialId)), "unknown credential");
  assert(credentials.lookup(disclose(credentialId)) == commitment, "commitment mismatch");
  assert(!revoked.member(disclose(credentialId)), "credential revoked");
  assert(issuers.member(disclose(fields.issuerPk)), "issuer not authorized");
  return disclose(DisclosedClaim {
    institutionId: fields.institutionId,
    degreeCode: fields.degreeCode,
    graduationYear: fields.graduationYear,
    gpaTimes100: revealGpa ? fields.gpaTimes100 : 0
  });
}
```

**Tamper-evidence works differently here, and the difference is worth
understanding.** In the EVM design, a verifier fetched an on-chain hash and
compared it to a recomputed one; a mismatch produced a `TAMPERED` result. On
Midnight there is nothing to compare, because a tampered credential **cannot
produce a proof at all** — altered fields yield a different commitment, the
assert fails, and proving aborts. Forgery is not detected after the fact; it is
unprovable. This collapses `TAMPERED` and `INVALID` into a single state
(`INVALID_PROOF`) and is why `api-spec.md` no longer has a separate tampered
branch.

## Design decisions

### Access control without addresses

There are no wallet addresses. An issuer proves control of a secret key by
deriving its public key in-circuit:

```compact
circuit publicKey(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([pad(32, "acadverify:pk:"), sk]);
}
```

The `"acadverify:pk:"` prefix is **domain separation** — it guarantees this hash
can never collide with a commitment or nullifier computed elsewhere in the
system. Reusing a domain across two purposes is the classic way to create a
linkability attack, so every hash in this contract carries its own prefix.

The secret key never leaves the witness. The chain sees only the derived public
key, and only when membership is being asserted.

### Duplicate prevention

`issue` asserts `!credentials.member(credentialId)`. Credential IDs embed a UUID
component off-chain, so two identical degrees still get distinct IDs — and
distinct salts, therefore distinct commitments.

### Revocation is one-way

No un-revoke. Correcting a mistake means issuing a new credential with a new ID.

### No upgradability for MVP

Issued records are append-only facts. If logic must change, deploy a v2 and have
the chain-service read both.

## Known privacy trade-off (be honest about this)

`credentialId` is **disclosed** on every `proveCredential` call, because
`Map.lookup` and `Set.member` take public arguments. Consequences:

- The verifier already knows the ID — it is in the QR code — so nothing leaks
  *to them*.
- But the network learns *that credential `X` was verified at time `T`*,
  building a public access log. Volume and timing are visible even though
  contents are not.

The fix is a `MerkleTree<N, Bytes<32>>` of commitments plus a ZK membership
proof: `MerkleTree.insert()` is the one ledger operation that hides its argument
(it stores `leaf_hash(value)`), and path proofs do not reveal which leaf is
being proven. Revocation would move to a nullifier set.

**Not doing that for the hackathon** — it is a substantially harder circuit and
a harder demo to narrate. Documenting it deliberately: judges reliably ask
"what's still leaking?", and having a specific answer with a named remedy is
worth more than pretending nothing is. Do not claim in the pitch that
verification is unlinkable.

## Testing requirements

- Happy path: authorize → issue → prove → revoke → prove fails.
- Adversarial: unauthorized issuer; duplicate ID; **wrong witness data (proof
  generation must fail, not return a bad result)**; revoked credential; unknown
  ID.
- Disclosure: assert `revealGpa: false` yields `gpaTimes100 == 0` and that
  `studentId` appears nowhere in the transcript.
- Regression: `contract-info.json` is committed, and any change to a circuit's
  argument or result type must be a reviewed diff — that file is the
  machine-checkable record of what the contract can reveal.

Use the `midnight-cq:compact-testing` and `midnight-verify:*` plugin skills; the
latter can verify circuits by ZKIR inspection and by execution.

## Deployment

Via the chain-service using `deployContract` from
`@midnight-ntwrk/midnight-js-contracts` (see `midnight-stack.md` §6). Scripted,
never manual. The deployed contract address per network is committed to
`midnight/deployments/<networkId>.json` for the chain-service to read.

---

## Appendix — Solidity (Cross-Chain stretch only)

Retained **only** if we attempt the Cross-Chain track: Midnight holds the
private logic and generates proofs; an EVM chain (Polygon Amoy) holds a public
existence anchor consuming the verified result.

Not part of the primary demo. Nothing in the main flow depends on it, and it
should be the first thing cut if time runs short.

```solidity
interface IAcademicCredentialAnchor {
    event CredentialAnchored(bytes32 indexed credentialId, bytes32 commitment, uint256 timestamp);
    function anchor(bytes32 credentialId, bytes32 commitment) external;
    function getAnchor(bytes32 credentialId) external view returns (bytes32 commitment, uint256 timestamp);
}
```

Note it anchors the **commitment** — never a raw hash of credential fields. The
original `AcademicCredential.sol` design (issuer address, metadata URI,
timestamp, SHA256 document hash) is superseded and must not be revived as-is:
its on-chain record leaks exactly the correlatable identifiers this project now
exists to remove.
