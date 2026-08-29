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
      <h1 className="text-2xl font-semibold text-slate-950">Verification</h1>
      <p className="mt-1 max-w-xl text-sm text-slate-600">
        Run a quick internal check on a credential your institution issued —
        useful for confirming a certificate before it goes out, without
        leaving the dashboard.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex max-w-xl gap-3">
        <div className="relative flex-1">
          <IconSearch
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          />
          <input
            value={credentialId}
            onChange={(event) => setCredentialId(event.target.value)}
            placeholder="Enter Credential ID"
            className="min-h-12 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
          />
        </div>
        <button
          type="submit"
          disabled={!credentialId.trim() || isLoading}
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isLoading ? "Checking\u2026" : "Verify"}
        </button>
      </form>

      {isLoading ? (
        <p className="mt-6 text-sm text-slate-600" role="status" aria-live="polite">
          Generating zero-knowledge proof&hellip;
        </p>
      ) : null}

      {result?.ok ? (
        <div className="mt-6 max-w-xl rounded-lg border border-slate-200 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
            {result.data.status.replace(/_/g, " ")}
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries(result.data.disclosed).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  {formatLabel(key)}
                </dt>
                <dd className="text-sm text-slate-950">
                  {value === null || value === "" ? "Not disclosed" : value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {result && !result.ok ? (
        <p role="alert" className="mt-6 max-w-xl rounded-lg border border-dotted border-slate-400 p-4 text-sm text-slate-700">
          {result.error.message}
        </p>
      ) : null}
    </section>
  );
}
