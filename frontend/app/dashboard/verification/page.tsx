"use client";

import { FormEvent, useState } from "react";
import { verifyCredential } from "@/lib/api";
import { formatLabel } from "@/lib/format";
import type { VerifyApiResult } from "@/lib/types";
import { IconSearch } from "@/components/icons";

export default function InternalVerificationPage() {
  const [credentialId, setCredentialId] = useState("");
  const [result, setResult] = useState<VerifyApiResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = credentialId.trim();
    if (!id) return;

    setIsLoading(true);
    setResult(null);
    const nextResult = await verifyCredential(id);
    setResult(nextResult);
    setIsLoading(false);
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold text-paper">Verification</h1>
      <p className="mt-1 max-w-xl text-sm text-paper-dim">
        Run a quick internal check on a credential your institution issued —
        useful for confirming a certificate before it goes out, without
        leaving the dashboard.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex max-w-xl gap-3">
        {/* A placeholder is not an accessible name: it disappears on first
            keystroke and several screen readers never announce it. This input
            had only a placeholder, so it was reachable but unannounced.
            Matches the labelling already used on the public /verify form. */}
        <label htmlFor="dashboardCredentialId" className="sr-only">
          Credential ID
        </label>
        <div className="relative flex-1">
          <IconSearch
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-paper-muted"
          />
          <input
            id="dashboardCredentialId"
            value={credentialId}
            onChange={(event) => setCredentialId(event.target.value)}
            placeholder="Enter Credential ID"
            className="min-h-12 w-full rounded-md border border-paper/20 bg-ink-800 pl-10 pr-3 text-base text-paper outline-none transition placeholder:text-paper-muted focus:border-gold-500 focus:ring-2 focus:ring-gold-500/10"
          />
        </div>
        <button
          type="submit"
          disabled={!credentialId.trim() || isLoading}
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-gold-500 px-6 text-sm font-semibold text-ink-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-paper-muted"
        >
          {isLoading ? "Checking\u2026" : "Verify"}
        </button>
      </form>

      {isLoading ? (
        <p className="mt-6 text-sm text-paper-dim" role="status" aria-live="polite">
          Generating zero-knowledge proof&hellip;
        </p>
      ) : null}

      {result?.ok ? (
        <div className="mt-6 max-w-xl rounded-lg border border-paper/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-paper-muted">
            {result.data.status.replace(/_/g, " ")}
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries(result.data.disclosed).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-paper-muted">
                  {formatLabel(key)}
                </dt>
                <dd className="text-sm text-paper">
                  {value === null || value === "" ? "Not disclosed" : value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {result && !result.ok ? (
        <p role="alert" className="mt-6 max-w-xl rounded-lg border border-dotted border-paper/25 p-4 text-sm text-danger-400">
          {result.error.message}
        </p>
      ) : null}
    </section>
  );
}
