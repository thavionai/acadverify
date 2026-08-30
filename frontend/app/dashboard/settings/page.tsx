"use client";

import { FormEvent, useEffect, useId, useState } from "react";
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
      <section className="rounded-lg border border-paper/10 bg-ink-900 p-8 text-center">
        <h1 className="text-lg font-semibold text-paper">
          Connect your issuer wallet
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-paper-dim">
          Settings are scoped to your connected institution wallet.
        </p>
      </section>
    );
  }

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-paper">Settings</h1>
        <p className="mt-1 text-sm text-paper-dim">
          Manage your institution's profile and wallet.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-paper-muted">
          Institution profile
        </h2>

        {institution.status === "loading" || institution.status === "idle" ? (
          <div className="mt-3 h-40 animate-pulse rounded-lg border border-paper/10 bg-ink-800" />
        ) : null}

        {institution.status === "loaded" && institution.profile.status === "NOT_REGISTERED" ? (
          <div className="mt-3 rounded-lg border border-paper/10 p-5">
            <p className="text-sm text-paper-dim">
              No institution is registered under this wallet yet.
            </p>
            <Link
              href="/institutions"
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md bg-gold-500 px-4 text-sm font-semibold text-ink-950 hover:bg-gold-400"
            >
              Start Setup
            </Link>
          </div>
        ) : null}

        {institution.status === "loaded" && institution.profile.status !== "NOT_REGISTERED" ? (
          <div className="mt-3 rounded-lg border border-paper/10 p-5">
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
                  className="text-sm font-semibold text-paper underline-offset-4 hover:underline"
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
                  <p role="alert" className="text-sm text-danger-400">
                    {error}
                  </p>
                ) : null}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex min-h-10 items-center justify-center rounded-md bg-gold-500 px-4 text-sm font-semibold text-ink-950 hover:bg-gold-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-paper-muted"
                  >
                    {isSaving ? "Saving\u2026" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-paper/20 px-4 text-sm font-semibold text-paper hover:bg-ink-850"
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
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-paper-muted">
          Security
        </h2>
        <div className="mt-3 rounded-lg border border-paper/10 p-5">
          <Field label="Connected Wallet" value={wallet.walletName} />
          <div className="mt-3">
            <Field label="Wallet Address" value={wallet.address} mono />
          </div>
          <p className="mt-4 text-xs text-paper-muted">
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
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-paper-muted">
        {label}
      </dt>
      <dd className={`mt-1 break-all text-sm text-paper ${mono ? "font-mono" : ""}`}>
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
  // Same defect as the setup wizard's field: an unassociated label leaves the
  // input with no accessible name.
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-paper">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="mt-2 min-h-11 w-full rounded-md border border-paper/20 bg-ink-800 px-3 text-sm text-paper outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/10"
      />
    </div>
  );
}
