"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { saveInstitutionProfile } from "@/lib/api";
import { useWalletContext } from "@/lib/wallet-context";
import type { SaveInstitutionInput } from "@/lib/types";
import { WalletConnectButton } from "@/components/dashboard/wallet-connect-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { IconCheck, IconClock, IconX } from "@/components/icons";

const EMPTY_INPUT: SaveInstitutionInput = {
  name: "",
  website: "",
  contactEmail: "",
  country: "",
};

const STEPS = ["Connect Wallet", "Institution Details", "Submitted"];

export function SetupWizard() {
  const { wallet, walletState, connect, disconnect, institution, refreshInstitution } =
    useWalletContext();
  const [input, setInput] = useState<SaveInstitutionInput>(EMPTY_INPUT);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const stepIndex = !wallet ? 0 : editing || institution.status !== "loaded" || institution.profile.status === "NOT_REGISTERED" ? 1 : 2;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet) return;

    setSubmitting(true);
    setSubmitError("");
    const result = await saveInstitutionProfile(input, wallet);
    setSubmitting(false);

    if (result.ok) {
      setEditing(false);
      refreshInstitution();
    } else {
      setSubmitError(result.error.message);
    }
  }

  function startEditing() {
    if (institution.status === "loaded" && institution.profile.status !== "NOT_REGISTERED") {
      setInput({
        name: institution.profile.name,
        website: institution.profile.website,
        contactEmail: institution.profile.contactEmail,
        country: institution.profile.country,
      });
    }
    setEditing(true);
  }

  return (
    <div id="setup" className="mx-auto max-w-xl scroll-mt-24 rounded-lg border border-paper/10 bg-ink-900 p-6 sm:p-8">
      <ol className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-paper-muted">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                index <= stepIndex ? "bg-gold-500 text-ink-950" : "bg-ink-800 text-paper-muted"
              }`}
            >
              {index + 1}
            </span>
            <span className={index <= stepIndex ? "text-paper" : ""}>{label}</span>
            {index < STEPS.length - 1 ? <span className="mx-1 h-px w-6 bg-paper/15" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-8">
        {!wallet ? (
          <div>
            <h2 className="text-lg font-semibold text-paper">Connect your institution wallet</h2>
            <p className="mt-2 text-sm text-paper-dim">
              We use your Midnight wallet address to identify your
              institution as an issuer. No witness data or private keys ever
              leave your browser.
            </p>
            <div className="mt-5">
              <WalletConnectButton
                state={walletState}
                onConnect={connect}
                onDisconnect={disconnect}
                showNetworkBadge={false}
              />
            </div>
          </div>
        ) : null}

        {wallet && (institution.status === "idle" || institution.status === "loading") ? (
          <div className="h-40 animate-pulse rounded-md bg-ink-800" />
        ) : null}

        {wallet && institution.status === "error" ? (
          <div>
            <p className="text-sm text-paper-dim">{institution.message}</p>
            <button
              type="button"
              onClick={refreshInstitution}
              className="mt-3 text-sm font-semibold text-paper underline-offset-4 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : null}

        {wallet && institution.status === "loaded" && !editing && institution.profile.status !== "NOT_REGISTERED" ? (
          <ProfileStatus profile={institution.profile} onEdit={startEditing} />
        ) : null}

        {wallet &&
        institution.status === "loaded" &&
        (editing || institution.profile.status === "NOT_REGISTERED") ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-lg font-semibold text-paper">Institution details</h2>
            <TextField
              label="Institution Name"
              value={input.name}
              onChange={(value) => setInput((c) => ({ ...c, name: value }))}
              placeholder="University of Ghana"
            />
            <TextField
              label="Official Website"
              value={input.website}
              onChange={(value) => setInput((c) => ({ ...c, website: value }))}
              placeholder="https://www.example.edu"
            />
            <TextField
              label="Contact Email"
              value={input.contactEmail}
              onChange={(value) => setInput((c) => ({ ...c, contactEmail: value }))}
              placeholder="registrar@example.edu"
              type="email"
            />
            <TextField
              label="Country"
              value={input.country}
              onChange={(value) => setInput((c) => ({ ...c, country: value }))}
              placeholder="Ghana"
            />

            {submitError ? (
              <p role="alert" className="text-sm text-danger-400">
                {submitError}
              </p>
            ) : null}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-gold-500 px-5 text-sm font-semibold text-ink-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-paper-muted"
              >
                {submitting ? "Submitting\u2026" : "Submit for Review"}
              </button>
              {editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-paper/20 px-5 text-sm font-semibold text-paper hover:bg-ink-850"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function ProfileStatus({
  profile,
  onEdit,
}: {
  profile: { status: string; name: string; rejectionReason?: string };
  onEdit: () => void;
}) {
  if (profile.status === "AUTHORIZED") {
    return (
      <div className="text-center">
        <StatusBadge label="Authorized" tone="solid" icon={<IconCheck className="h-full w-full" />} />
        <h2 className="mt-3 text-lg font-semibold text-paper">
          {profile.name} is authorized
        </h2>
        <p className="mt-2 text-sm text-paper-dim">
          Your institution can issue credentials.
        </p>
        <Link
          href="/dashboard/issue"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-gold-500 px-5 text-sm font-semibold text-ink-950 hover:bg-gold-400"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  if (profile.status === "PENDING_REVIEW") {
    return (
      <div className="text-center">
        <StatusBadge label="Pending Review" tone="dashed" icon={<IconClock className="h-full w-full" />} />
        <h2 className="mt-3 text-lg font-semibold text-paper">
          Application submitted
        </h2>
        <p className="mt-2 text-sm text-paper-dim">
          {profile.name} is under review. This usually takes 1–2 business
          days — you'll be able to issue credentials as soon as it's
          approved.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <StatusBadge label="Rejected" tone="outline" icon={<IconX className="h-full w-full" />} />
      <h2 className="mt-3 text-lg font-semibold text-paper">
        Application not approved
      </h2>
      <p className="mt-2 text-sm text-paper-dim">
        {profile.rejectionReason || "Update your details and resubmit."}
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-gold-500 px-5 text-sm font-semibold text-ink-950 hover:bg-gold-400"
      >
        Update & Resubmit
      </button>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  // The label carried no htmlFor, the input no id, and the input was not
  // nested inside the label — so this was decorative text, not a label.
  // Clicking it did nothing and a screen reader announced an unnamed field.
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-paper">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 min-h-11 w-full rounded-md border border-paper/20 bg-ink-800 px-3 text-sm text-paper outline-none transition placeholder:text-paper-muted focus:border-gold-500 focus:ring-2 focus:ring-gold-500/10"
      />
    </div>
  );
}
