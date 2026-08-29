"use client";

import Link from "next/link";
import { useWalletContext } from "@/lib/wallet-context";

export function InstitutionStatusBanner() {
  const { wallet, institution, refreshInstitution } = useWalletContext();

  if (!wallet) return null;
  if (institution.status === "idle" || institution.status === "loading") return null;

  if (institution.status === "error") {
    return (
      <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-dotted border-slate-400 bg-white px-4 py-3 text-sm">
        <span className="text-slate-700">{institution.message}</span>
        <button
          type="button"
          onClick={refreshInstitution}
          className="font-semibold text-slate-950 underline-offset-4 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const { profile } = institution;

  if (profile.status === "AUTHORIZED") return null;

  if (profile.status === "NOT_REGISTERED") {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-slate-950 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-800">
          <span className="font-semibold">Set up your institution</span> to
          start issuing credentials.
        </p>
        <Link
          href="/institutions"
          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Start Setup
        </Link>
      </div>
    );
  }

  if (profile.status === "PENDING_REVIEW") {
    return (
      <div className="mb-6 rounded-lg border border-dashed border-slate-400 bg-white px-4 py-3">
        <p className="text-sm text-slate-800">
          <span className="font-semibold">Registration pending review.</span>{" "}
          Your institution can't issue credentials yet — this usually takes 1–2
          business days.
        </p>
      </div>
    );
  }

  if (profile.status === "REJECTED") {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-slate-950 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-800">
          <span className="font-semibold">Registration was not approved.</span>{" "}
          {profile.rejectionReason || "Update your details and resubmit."}
        </p>
        <Link
          href="/institutions"
          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-slate-950 px-4 text-sm font-semibold text-slate-950 hover:bg-slate-50"
        >
          Review Application
        </Link>
      </div>
    );
  }

  return null;
}
