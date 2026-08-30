# Submission kit — MLH Midnight Hackathon

Deadlines: **initial Sun 10:00 ET · final Sun 11:45 ET**. One owner. Submit
early, then re-open every link in a private browser window.

## Checklist

- [x] Public repo — https://github.com/thavionai/acadverify
- [ ] Demo video ≤ 2:00, **public**, says "Midnight Hackathon" in the first seconds
- [ ] Add `## Demo` block to README with video + Devpost link (dropped in the #30 rewrite)
- [ ] Devpost entry created (title, tagline, description below, video, repo link)
- [ ] MLH registration + check-in with the **same email** as Devpost
- [ ] Track: **Integrate Midnight** — prior-work disclosure is in README › Project Status
- [ ] Team ≤ 5 listed on Devpost
- [ ] Screenshot added to README

## Devpost copy

**Title:** AcadVerify

**Tagline:** Verify a degree without seeing the student.

**Inspiration.** Employers verify credentials by receiving the whole document —
student ID, grades, the lot. A forged PDF looks identical to a real one.

**What it does.** A university issues a credential; the student gets a QR;
an employer scans it and sees VALID / REVOKED / INVALID_PROOF plus only the
fields the student consented to share. Nothing personal — not even a hash —
touches the chain.

**How Midnight is used.** One blinded commitment per credential on-chain.
`proveCredential` is a Compact circuit whose result type has *no field* for
the student's identity, so leaking it is a compile error, not a policy. A
forged credential is not "caught" — it cannot produce a proof at all.

**What we built this weekend.** Compact contract (4 circuits) · Node 22
chain-service over Midnight.js · FastAPI backend · Next.js dashboard + public
verify page · student portal with per-employer share links · AI resume
checker (Gemini reads claims, deterministic code judges them, PII stripped
first) · local devnet (node, indexer, proof server) · 121 backend + 66
chain-service + 4 browser tests, live smoke tests, salt-leak check.

**What we learned / limitations.** Issuance takes ~25 s (mostly waiting for 6 s blocks; the proof itself ~2 s);
verification is instant because it never touches the proof server.
`credentialId` is disclosed per verification, so we don't claim
unlinkability. Not yet on `preview` — runs on the local devnet.

**What's next.** Deploy to `preview`; ship the detachable ZK proof bundle.

## 2:00 video script

| Time | Beat | Say / show |
|---|---|---|
| 0:00 | Name + problem | "This is AcadVerify for the **Midnight Hackathon**. Employers today verify a degree by receiving the whole transcript — and a forged one looks identical." |
| 0:15 | Happy path | Dashboard › Issue → QR appears → open `/verify/<id>` → **VALID**, disclosed vs withheld split. Then revoke → rescan → **REVOKED**. |
| 1:20 | Why Midnight | Show the `proveCredential` return struct in `academic_credential.compact`: no `studentId`. "The compiler enforces the privacy, not our discipline. A fake credential can't make a proof." |
| 1:45 | Evidence + close | Terminal: `npm run compact` (4 circuits) and `npm test` (66 passed). Repo URL on screen. "Verify the degree. Never see the student." |

Rehearse twice. Record the terminal output beforehand as a backup clip.
