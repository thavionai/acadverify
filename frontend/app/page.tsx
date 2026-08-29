import Image from "next/image";
import Link from "next/link";
import { PublicNav } from "@/components/public/public-nav";
import { ScrollReveal } from "@/components/public/scroll-reveal";
import { ProblemPanels } from "@/components/public/problem-panels";
import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconLock,
  IconShieldCheck,
  IconX,
} from "@/components/icons";

/* ---------------------------------------------------------------------------
   Every factual claim on this page is either sourced (see SOURCES) or describes
   behaviour that actually ships today. Anything not yet built is labelled as
   planned rather than implied — the same standard applied when the "Midnight
   Testnet" and "IPFS" claims were removed from the product UI.
--------------------------------------------------------------------------- */

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "The university issues",
    body: "A blinded commitment is written to Midnight. No name, no grade, no document — not even a hash of them. Only the university's authorised key can create it.",
  },
  {
    step: "02",
    title: "The graduate holds",
    body: "The credential's actual contents stay off-chain, under the holder's control. Losing them is the only way to lose the credential; nobody else can open the commitment.",
  },
  {
    step: "03",
    title: "The employer verifies",
    body: "A zero-knowledge proof confirms the degree is real, unrevoked, and from an authorised issuer — revealing only the fields the graduate consented to share.",
  },
];

const DISCLOSURE_DEMO = {
  shared: [
    { field: "Institution", value: "North Valley University" },
    { field: "Degree", value: "Master of Artificial Intelligence" },
    { field: "Graduation year", value: "2026" },
  ],
  withheld: ["Student identity", "GPA", "Transcript", "Date of birth", "Address"],
};

const SHIPPING_NOW = [
  "Selective disclosure — reveal a degree without revealing identity or GPA",
  "On-chain revocation, checkable in seconds",
  "Issuer authorisation enforced in the circuit, not by a database",
  "Forgery is unprovable, not merely detected",
];

const NEXT_UP = [
  "Proofs generated in the graduate's own wallet, so the platform never holds their data",
  "A portable credential wallet for graduates",
  "Verification that reveals nothing at all — not even which credential was checked",
];

export default function Home() {
  return (
    <div className="relative bg-ink-950 text-paper">
      <PublicNav variant="dark" />
      <main>
        {/* ---------------------------------------------------------------
            Hero
        --------------------------------------------------------------- */}
        <section className="relative isolate overflow-hidden">
          <div className="absolute inset-0 -z-10">
            {/* Deliberately the sequence's own opening frame, not a copy of
                it. The two were byte-identical, so the page paid for the same
                548 KB twice and the hero could silently drift out of sync with
                the shot the zoom sequence opens on. Same src, same `sizes`, so
                the second request is a cache hit. */}
            <Image
              src="/images/sequence/00-tree.webp"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
            {/* Two scrims, not one. The artwork is busy and text over it fails
                contrast, but a single flat scrim heavy enough for the headline
                also kills the canopy — and the scroll sequence below opens on
                this exact image at full strength, so a dimmed hero reads as a
                brightness jump at the handover.

                So: a light body scrim that deepens toward the copy, plus a
                short band under the nav, which is the only place white text
                sits over the bright gold branches. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-b from-ink-950/35 via-ink-950/65 to-ink-950"
            />
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-ink-950/85 to-transparent"
            />
          </div>

          <div className="mx-auto flex min-h-[88vh] max-w-6xl flex-col justify-end px-5 pb-20 pt-28 sm:px-8">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-gold-500">
              <IconShieldCheck className="h-4 w-4" aria-hidden />
              Built on Midnight
            </p>

            <h1 className="mt-6 max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              A degree should prove itself.
              <span className="block text-gold-400">
                Not expose the graduate.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-paper-dim">
              Today, proving one line of your education means handing over all of
              it — your transcript, your grades, your identity. AcadVerify lets a
              university issue a credential that verifies cryptographically in
              seconds, while the graduate decides exactly what the verifier gets
              to see.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/verify"
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-gold-500 px-6 text-sm font-semibold text-ink-950 transition hover:bg-gold-400"
              >
                Verify a credential
                <IconArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-paper/25 px-6 text-sm font-semibold text-paper transition hover:border-gold-500 hover:text-gold-300"
              >
                For universities
              </Link>
            </div>

            {/* The sequence below picks up on this same tree and pushes into
                it. Without a cue the hero reads as a full stop and the whole
                sequence goes unseen. `animate-bounce` is neutralised by the
                reduced-motion rule in globals.css. */}
            <p
              aria-hidden
              className="mt-16 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-paper-muted"
            >
              Scroll
              <IconChevronDown className="h-4 w-4 animate-bounce text-gold-500" />
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Scroll-driven zoom: the tree -> one diploma -> it was forged.
            The argument below lands harder once you have been shown that
            you could not tell the difference yourself.
        --------------------------------------------------------------- */}
        <ScrollReveal />

        {/* ---------------------------------------------------------------
            The problem, in the order the three parts compound. The headline
            names all three; each panel below argues one of them.
        --------------------------------------------------------------- */}
        <section className="border-t border-paper/10 px-5 pb-16 pt-24 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-500">
              The problem
            </p>
            <h2 className="mt-5 max-w-4xl text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
              The fake is cheap.
              <span className="block">The check is slow.</span>
              <span className="block text-gold-400">
                The honest route leaks.
              </span>
            </h2>
            <p className="mt-6 max-w-2xl text-pretty text-lg text-paper-dim">
              Three separate failures, and a graduate has to live inside all of
              them at once.
            </p>
          </div>
        </section>

        <ProblemPanels />

        {/* ---------------------------------------------------------------
            The problem — part two: the over-disclosure tax
        --------------------------------------------------------------- */}
        <section className="border-t border-paper/10 bg-ink-900 px-5 py-24 sm:px-8">
          <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-500">
                The part nobody talks about
              </p>
              <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Every honest graduate pays a privacy tax.
              </h2>
              <div className="mt-5 space-y-4 text-pretty text-lg leading-relaxed text-paper-dim">
                <p>
                  To prove a single fact — <em>this person holds this degree</em>{" "}
                  — the standard process asks for the whole record. Grades in
                  courses nobody asked about. Dates that reveal your age. A
                  student number that follows you between systems.
                </p>
                <p>
                  Putting credentials on a public blockchain usually makes this{" "}
                  <span className="text-paper">worse</span>, not better: it adds a
                  permanent, correlatable record of everything you have ever
                  earned.
                </p>
              </div>
            </div>

            {/* Side-by-side: what a verifier learns, and what they don't. */}
            <div className="rounded-lg border border-paper/15 bg-ink-950 p-6 sm:p-8">
              <p className="text-sm font-semibold text-paper">
                One verification, two very different outcomes
              </p>

              <div className="mt-6">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-500">
                  <IconCheck className="h-3.5 w-3.5" aria-hidden />
                  Shared with the employer
                </p>
                <dl className="mt-3 space-y-2">
                  {DISCLOSURE_DEMO.shared.map((row) => (
                    <div
                      key={row.field}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-paper/10 pb-2 last:border-b-0"
                    >
                      <dt className="text-sm text-paper-muted">{row.field}</dt>
                      <dd className="font-mono text-sm text-paper">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="mt-8">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-paper-muted">
                  <IconLock className="h-3.5 w-3.5" aria-hidden />
                  Never leaves the graduate
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {DISCLOSURE_DEMO.withheld.map((field) => (
                    <li
                      key={field}
                      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-paper/25 px-3 py-1.5 text-sm text-paper-muted"
                    >
                      <IconX className="h-3 w-3 shrink-0" aria-hidden />
                      {field}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            How it works
        --------------------------------------------------------------- */}
        <section className="border-t border-paper/10 px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-500">
              How it works
            </p>
            <h2 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Three parties. Nothing shared that wasn&apos;t agreed.
            </h2>

            <ol className="mt-14 grid gap-8 md:grid-cols-3">
              {HOW_IT_WORKS.map((item) => (
                <li key={item.step} className="border-t border-gold-500/40 pt-6">
                  <span className="font-mono text-sm font-semibold text-gold-500">
                    {item.step}
                  </span>
                  <h3 className="mt-3 text-xl font-semibold text-paper">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-pretty leading-relaxed text-paper-muted">
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            The claim that does the most work
        --------------------------------------------------------------- */}
        <section className="border-t border-paper/10 bg-ink-900 px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-500">
              Why this is different
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
              A forged credential doesn&apos;t get caught.
              <span className="block text-gold-400">It can&apos;t be proven.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-paper-dim">
              Most systems detect tampering after the fact by comparing hashes.
              Here there is nothing to compare: altered details produce a
              different commitment, the proof simply fails to generate, and no
              output exists to present. Forgery isn&apos;t flagged — it is
              impossible to produce.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Live today vs. planned — stated separately, on purpose
        --------------------------------------------------------------- */}
        <section className="border-t border-paper/10 px-5 py-24 sm:px-8">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-paper">
                <span className="inline-flex h-2 w-2 rounded-full bg-gold-500" aria-hidden />
                Working today
              </h2>
              <ul className="mt-6 space-y-4">
                {SHIPPING_NOW.map((item) => (
                  <li key={item} className="flex gap-3 text-paper-dim">
                    <IconCheck
                      className="mt-1 h-4 w-4 shrink-0 text-gold-500"
                      aria-hidden
                    />
                    <span className="text-pretty leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-paper-muted">
                <span
                  className="inline-flex h-2 w-2 rounded-full border border-paper-muted"
                  aria-hidden
                />
                Next
              </h2>
              <ul className="mt-6 space-y-4">
                {NEXT_UP.map((item) => (
                  <li key={item} className="flex gap-3 text-paper-muted">
                    <span
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-paper-muted"
                      aria-hidden
                    />
                    <span className="text-pretty leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Closing call to action
        --------------------------------------------------------------- */}
        <section className="border-t border-paper/10 bg-ink-900 px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              See it prove a degree without revealing one.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-paper-dim">
              Verify a real credential, then verify it again with the GPA
              disclosed. Same record on the ledger. Two different answers.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/verify"
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-gold-500 px-7 text-sm font-semibold text-ink-950 transition hover:bg-gold-400"
              >
                Try the verification portal
                <IconArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-paper/10 px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-paper">AcadVerify</p>
              <p className="mt-1 text-sm text-paper-muted">
                Privacy-preserving academic credentials, built on Midnight.
              </p>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link href="/verify" className="text-paper-muted transition hover:text-gold-300">
                Verify
              </Link>
              <Link href="/dashboard" className="text-paper-muted transition hover:text-gold-300">
                Universities
              </Link>
              <Link href="/institutions" className="text-paper-muted transition hover:text-gold-300">
                Institutions
              </Link>
              <a
                href="https://docs.midnight.network/"
                className="text-paper-muted transition hover:text-gold-300"
                target="_blank"
                rel="noreferrer"
              >
                Midnight docs
              </a>
            </nav>
          </div>

          {/* Every figure on this page is attributed here so it can be
              checked rather than taken on trust. A previous version credited an
              applicant-misrepresentation statistic to a source that does not
              contain it; that figure has been removed rather than re-sourced. */}
          <p className="mt-10 border-t border-paper/10 pt-6 text-xs leading-relaxed text-paper-muted">
            Sources — $49: fake-diploma vendor pricing, observed directly,
            August 2026. 5&ndash;10 business days: education-verification
            turnaround per iprospectcheck and Vertical Identity. 62 million:
            the PowerSchool breach disclosed in January 2025, reported by
            BleepingComputer and NBC News. Prototype built for the MLH Midnight
            Hackathon.
          </p>
        </div>
      </footer>
    </div>
  );
}
