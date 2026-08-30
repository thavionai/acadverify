"use client";

import { PublicNav } from "@/components/public/public-nav";
import { SetupWizard } from "@/components/institutions/setup-wizard";
import { IconAward, IconGraduationCap, IconShieldCheck } from "@/components/icons";

const BENEFITS = [
  {
    icon: IconGraduationCap,
    title: "Issue in minutes",
    description: "Mint tamper-proof, zero-knowledge academic credentials directly from your dashboard.",
  },
  {
    icon: IconShieldCheck,
    title: "Verifiable, not exposed",
    description: "Employers confirm a credential is real without your students revealing more than they choose to.",
  },
  {
    icon: IconAward,
    title: "Built on Midnight",
    description: "Immutable commitments on-chain; private student data never leaves the browser unencrypted.",
  },
];

export function InstitutionsPageClient() {
  return (
    <>
      <PublicNav />
      <main className="flex-1 bg-ink-950">
        <section className="mx-auto max-w-4xl px-5 pb-12 pt-16 text-center sm:px-8">
          <h1 className="text-4xl font-semibold tracking-tight text-paper sm:text-5xl">
            Bring your institution onto AcadVerify
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-paper-dim">
            Register your university to start issuing zero-knowledge academic
            credentials your graduates can prove, and employers can trust.
          </p>
          <a
            href="#setup"
            className="mt-8 inline-flex min-h-12 items-center justify-center rounded-md bg-gold-500 px-6 text-sm font-semibold text-ink-950 transition hover:bg-gold-400"
          >
            Start Setup
          </a>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
          <div className="grid gap-5 sm:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="rounded-lg border border-paper/10 p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-ink-800 text-paper">
                  <benefit.icon className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="mt-4 font-semibold text-paper">{benefit.title}</h2>
                <p className="mt-2 text-sm text-paper-dim">{benefit.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-ink-950 px-5 py-16 sm:px-8">
          <SetupWizard />
        </section>

      </main>
    </>
  );
}
