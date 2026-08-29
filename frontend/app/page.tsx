import Link from "next/link";
import { PublicNav } from "@/components/public/public-nav";
import { TrustStrip } from "@/components/public/trust-strip";
import {
  IconBuilding,
  IconCheck,
  IconLock,
  IconShieldCheck,
  IconUser,
} from "@/components/icons";

const PORTALS = [
  {
    icon: IconUser,
    title: "Student Portal",
    description:
      "Manage your credentials and share selective ZK-proofs with employers.",
    cta: "Coming Soon",
    href: null,
  },
  {
    icon: IconBuilding,
    title: "University Registry",
    description:
      "Issue and manage tamper-proof academic records for your students.",
    cta: "Launch Admin Registry",
    href: "/dashboard",
  },
  {
    icon: IconShieldCheck,
    title: "Verification Portal",
    description:
      "Instantly verify academic claims without compromising student privacy.",
    cta: "Start Verification",
    href: "/verify",
  },
] as const;

const STEPS = [
  {
    number: "1",
    title: "Mint",
    description: "Universities issue immutable credentials to the ledger.",
  },
  {
    number: "2",
    title: "Store",
    description: "Students securely store their records in private wallets.",
  },
  {
    number: "3",
    title: "Prove",
    description: "Employers verify credentials via Zero-Knowledge proofs.",
  },
];

const PRIVACY_POINTS = [
  "Selective Disclosure",
  "Cryptographic Certainty",
  "Total User Control",
];

export default function Home() {
  return (
    <>
      <PublicNav />
      <main>
        <section className="mx-auto max-w-4xl px-5 pb-16 pt-20 text-center sm:px-8">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
            The Future of Academic Trust
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Secure, private, and instantly verifiable academic credentials
            powered by the Midnight blockchain and Zero-Knowledge proofs.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/verify"
              className="inline-flex min-h-12 items-center justify-center rounded-md bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
            >
              Enter Portal
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-slate-300 px-6 text-sm font-semibold text-slate-950 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
            >
              Learn More
            </a>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
          <div className="grid gap-5 sm:grid-cols-3">
            {PORTALS.map((portal) => (
              <div
                key={portal.title}
                className="flex flex-col rounded-lg border border-slate-200 p-6"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-950">
                  <portal.icon className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-lg font-semibold text-slate-950">
                  {portal.title}
                </h2>
                <p className="mt-2 flex-1 text-sm text-slate-600">
                  {portal.description}
                </p>
                {portal.href ? (
                  <Link
                    href={portal.href}
                    className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 text-sm font-semibold text-slate-950 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
                  >
                    {portal.cta}
                  </Link>
                ) : (
                  <span
                    aria-disabled
                    className="mt-5 inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-md border border-dashed border-slate-300 text-sm font-semibold text-slate-400"
                  >
                    {portal.cta}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-y border-slate-200 bg-slate-50 px-5 py-16 sm:px-8"
        >
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-2xl font-semibold text-slate-950">How it Works</h2>
            <p className="mt-2 text-slate-600">
              A seamless, trustless process for academic verification.
            </p>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl gap-5 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="rounded-lg border border-slate-200 bg-white p-6 text-center"
              >
                <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                  {step.number}
                </span>
                <h3 className="mt-4 font-semibold text-slate-950">{step.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-950 px-5 py-16 text-white sm:px-8">
          <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 sm:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">
                Zero-Knowledge Privacy
              </h2>
              <p className="mt-4 text-slate-300">
                Prove you graduated without revealing your exact GPA, student
                ID, or personal address. Zero-Knowledge proofs allow
                verifiable claims to be validated without exposing the
                underlying raw data. Trust is established
                cryptographically, not through unnecessary disclosure.
              </p>
              <ul className="mt-6 space-y-3">
                {PRIVACY_POINTS.map((point) => (
                  <li key={point} className="flex items-center gap-2 text-sm">
                    <IconCheck className="h-4 w-4 shrink-0" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-white p-10 text-center text-slate-950">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <IconLock className="h-6 w-6" />
              </span>
              <p className="mt-4 font-semibold">Proof Generated</p>
              <p className="mt-1 text-sm text-slate-500">
                Validity: True | Data: Hidden
              </p>
            </div>
          </div>
        </section>

        <TrustStrip />
      </main>

      <footer className="border-t border-slate-200 px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-slate-950">AcadVerify</p>
            <p>
              &copy; {new Date().getFullYear()} AcadVerify. Built on Midnight
              Testnet.
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <a href="#" className="hover:text-slate-950 hover:underline">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-slate-950 hover:underline">
              Terms of Service
            </a>
            <a href="#" className="hover:text-slate-950 hover:underline">
              Documentation
            </a>
            <a href="#" className="hover:text-slate-950 hover:underline">
              Support
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
