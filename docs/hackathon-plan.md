# AcadVerify — Hackathon Plan

## The event

**MLH Midnight Hackathon** — Aug 28–30, 2026 · [event page](https://events.mlh.com/events/14510-midnight-hackathon-august)

- **Primary track: Integrate Midnight** — take an existing app and add a
  meaningful Midnight-powered privacy feature. AcadVerify is the existing app;
  Midnight becomes its privacy layer. The "before and after" the track asks for
  is unusually clean here (see `architecture.md`).
- Stretch: **Cross-Chain** — Midnight holds the private logic, an EVM chain
  consumes the verified result.
- Devpost: initial **Sun 10:00 AM ET**, final **Sun 11:45 AM ET**.
- Prize: $125 gift card per winning team member.

## Pitch (30 seconds)

> Fake degrees are a global problem, and verifying a real one takes weeks of
> emails — or means handing over your entire transcript to prove one line of it.
> AcadVerify lets a university issue credentials on **Midnight**, so an employer
> can verify in seconds from a QR code that a degree is valid, non-revoked, and
> from an authorized issuer — via a **zero-knowledge proof that reveals only
> what the student consented to share**. Not even a hash of personal data
> touches the chain. And a forged credential doesn't get *caught* — it simply
> **cannot produce a proof at all**.

## The "before and after" (this is the track's actual ask)

| | Before (EVM design) | After (Midnight) |
|---|---|---|
| On-chain per credential | SHA256 hash + issuer address + metadata URI + timestamp | one blinded commitment |
| Verifier learns | every field in the document | only consented fields |
| Forgery | detected after the fact via hash mismatch | **unprovable** — no proof exists |
| Brute-force | real: low-entropy fields, salt printed in the QR | none: blinded commitment |
| Erasure | hash persists, "unlinkable" but brute-forceable | delete the salt → permanently unopenable |

## Roadmap

### Phase 1 — Setup ✅
- [x] Repo, docs, branching
- [x] Node 22, Compact toolchain (0.31.1 / language 0.23.0 / runtime 0.16.0)
- [x] Midnight plugin suite (16 plugins, 88 skills)
- [x] Local devnet: node + indexer + proof server, verified responding
- [x] `academic_credential.compact` compiles — 4 circuits, keys, TS API

### Phase 2 — Contract
- [ ] Tests: happy path + adversarial (wrong witness must fail to prove)
- [ ] Deploy to local devnet via chain-service
- [ ] Deploy to **`preview`** (tDUST from faucet)
- [ ] Commit `midnight/deployments/preview.json`

### Phase 3 — Chain-service + backend
- [ ] Chain-service: six providers wired, HTTP API per `api-spec.md`
- [ ] FastAPI: issue/list/revoke/verify, QR, DynamoDB + S3
- [ ] Salt generation + private state store

### Phase 4 — Frontend
- [ ] Public verify page with the four states and the **disclosed / withheld** split
- [ ] Dashboard: issue, list, revoke
- [ ] QR scan flow

### Phase 5 — Deploy
- [ ] Docker, AWS, GitHub Actions

## Demo storyline (what the judges see)

1. **Issue** — Admin fills the form, clicks Issue. Show the commitment landing
   on-chain via an indexer query.
2. **Verify (minimal)** — Judge scans the QR → **VERIFIED**: valid Master's
   degree from an authorized issuer. Point at what is *not* on screen: no name,
   no GPA, no transcript.
3. **Verify (with consent)** — Same credential, student consents to disclose
   GPA → same green result, now with GPA. **Same on-chain record, two different
   disclosures.** This is the money shot; rehearse it until it's crisp.
4. **Revoke** — Admin revokes live. Judge refreshes → **REVOKED**.
5. **Forge** — Attempt to verify a credential with altered fields → no proof can
   be generated. Not "we detected a mismatch" — **the proof does not exist**.

Show the `withheld` list in the UI. Selective disclosure is invisible unless you
show what was held back.

## Judging criteria mapping

- **Innovation** — selective disclosure on a real credential lifecycle; the
  verifier learns strictly less than the credential contains.
- **Technical depth** — Compact circuits with commitments, domain-separated key
  derivation, the compiler's disclosure analysis as an enforced privacy boundary,
  and `contract-info.json` as a machine-checkable record of what can be revealed.
- **Impact** — credential fraud plus the over-disclosure tax on every honest
  graduate.
- **Completeness** — full lifecycle: issue → certificate → verify → consent →
  revoke → forgery attempt.

## Team workstreams

Branch convention: **`<yourname>-<area>`** — six people share this repo, so every
branch carries its owner's name.

| Workstream | Role |
|---|---|
| Compact contract, tests, devnet + preview deploy | [Blockchain](roles/blockchain-engineer.md) |
| chain-service (Midnight.js), providers, proving | [Chain-service](roles/chain-service-engineer.md) |
| FastAPI, metadata, QR, orchestration | [Backend](roles/backend-engineer.md) |
| Dashboard, verify portal, disclosure UX | [Frontend](roles/frontend-engineer.md) |
| Compose, CI, AWS, proof-server ops | [SRE / DevOps](roles/sre-devops.md) |
| Docs, tests, seed data, demo | [Product / QA](roles/product-qa.md) |

## Scope guardrails

### Must have
- Contract on `preview` with issue / revoke / prove / duplicate prevention / issuer restriction
- Selective disclosure working for **at least one field** (GPA)
- Public verify endpoint + portal: VALID / REVOKED / INVALID_PROOF / service error
- Dashboard: issue, list, revoke
- QR certificate + scan-to-verify
- Seed data including a credential with deliberately wrong witness data

### Out of scope (designed in docs, not built)
University login, mainnet, institution-held keys, real KYC, MerkleTree
unlinkability (see the trade-off in `smart-contract.md`).

## Cut order if behind

1. Cross-Chain stretch — first to go, nothing depends on it
2. Lace wallet client-side proving → platform-generated proofs only
3. Selective disclosure → single "valid / revoked, nothing revealed" proof
4. `preview` → demo on local devnet, **and say so plainly**

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Proof generation too slow on stage** | The real risk — proving is CPU-bound, default 2 workers. Pre-generate demo proofs, raise `--num-workers`, rehearse on the demo machine |
| Faucet dry / tDUST unavailable | Fund wallets Friday; keep a working local-devnet demo as fallback |
| Preview network down at demo time | Local devnet fallback rehearsed and ready |
| Private state lost → credentials unprovable | Back up the store before the demo; keep a seeded fixture set |
| Venue network blocks endpoints | Mobile hotspot; local devnet needs no internet |
| Judges ask "what still leaks?" | Answer ready: `credentialId` is disclosed per verification, building a public access log. Named remedy in `smart-contract.md`. **Do not claim unlinkability.** |
| Scope creep | Anything off the must-have list needs unanimous agreement |

## Future enhancements

Student-held salts via Lace, MerkleTree unlinkable verification, W3C Verifiable
Credentials / DID alignment, multi-university onboarding, employer portal,
bulk issuance, mobile app, cross-chain attestations.

> "Zero Knowledge Proofs" was listed as a *future enhancement* in the original
> plan. It is now the core of the product, which is precisely what the Integrate
> Midnight track is asking for.
