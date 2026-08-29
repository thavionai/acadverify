"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { saveInstitutionProfile } from "@/lib/api";
import { useWalletContext } from "@/lib/wallet-context";
import type { SaveInstitutionInput } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { IconCheck, IconX } from "@/components/icons";

const EMPTY_INPUT: SaveInstitutionInput = {
  name: "",
  website: "",
  contactEmail: "",
  country: "",
};

export default function SettingsPage() {
  const { wallet, institution, refreshInstitution } = useWalletContext();
  const [input, setInput] = useState<SaveInstitutionInput>(EMPTY_INPUT);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (institution.status === "loaded" && institution.profile.status !== "NOT_REGISTERED") {
      setInput({
        name: institution.profile.name,
        website: institution.profile.website,
        contactEmail: institution.profile.contactEmail,
        country: institution.profile.country,
      });
    }
  }, [institution]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet) return;

    setIsSaving(true);
    setError("");
    const result = await saveInstitutionProfile(input, wallet);
    setIsSaving(false);

    if (result.ok) {
      setIsEditing(false);
      refreshInstitution();
    } else {
      setError(result.error.message);
    }
  }

  if (!wallet) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-950">
          Connect your issuer wallet
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Settings are scoped to your connected institution wallet.
        </p>
      </section>
    );
  }

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage your institution's profile and wallet.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
          Institution profile
        </h2>

        {institution.status === "loading" || institution.status === "idle" ? (
          <div className="mt-3 h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
        ) : null}

        {institution.status === "loaded" && institution.profile.status === "NOT_REGISTERED" ? (
          <div className="mt-3 rounded-lg border border-slate-200 p-5">
            <p className="text-sm text-slate-700">
              No institution is registered under this wallet yet.
            </p>
            <Link
              href="/institutions"
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Start Setup
            </Link>
          </div>
        ) : null}

        {institution.status === "loaded" && institution.profile.status !== "NOT_REGISTERED" ? (
          <div className="mt-3 rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <StatusBadge
                label={institution.profile.status.replace(/_/g, " ")}
                tone={institution.profile.status === "AUTHORIZED" ? "solid" : "outline"}
                icon={
                  institution.profile.status === "AUTHORIZED" ? (
                    <IconCheck className="h-full w-full" />
                  ) : (
                    <IconX className="h-full w-full" />
                  )
                }
              />
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-sm font-semibold text-slate-950 underline-offset-4 hover:underline"
                >
                  Edit
                </button>
              ) : null}
            </div>

            {!isEditing ? (
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Institution Name" value={institution.profile.name} />
                <Field label="Website" value={institution.profile.website} />
                <Field label="Contact Email" value={institution.profile.contactEmail} />
                <Field label="Country" value={institution.profile.country} />
              </dl>
            ) : (
              <form onSubmit={handleSave} className="mt-4 space-y-4">
                <TextField
                  label="Institution Name"
                  value={input.name}
                  onChange={(value) => setInput((c) => ({ ...c, name: value }))}
                />
                <TextField
                  label="Website"
                  value={input.website}
                  onChange={(value) => setInput((c) => ({ ...c, website: value }))}
                />
                <TextField
                  label="Contact Email"
                  value={input.contactEmail}
                  onChange={(value) => setInput((c) => ({ ...c, contactEmail: value }))}
                />
                <TextField
                  label="Country"
                  value={input.country}
                  onChange={(value) => setInput((c) => ({ ...c, country: value }))}
                />
                {error ? (
                  <p role="alert" className="text-sm text-slate-700">
                    {error}
                  </p>
                ) : null}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSaving ? "Saving\u2026" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-950 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}
      </section>

      <section id="security">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
          Security
        </h2>
        <div className="mt-3 rounded-lg border border-slate-200 p-5">
          <Field label="Connected Wallet" value={wallet.walletName} />
          <div className="mt-3">
            <Field label="Wallet Address" value={wallet.address} mono />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            This dashboard never sends witness data or private key material
            to the server — only the public wallet address is used to
            identify your institution.
          </p>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </dt>
      <dd className={`mt-1 break-all text-sm text-slate-950 ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-800">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
      />
    </div>
  );
}
