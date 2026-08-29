"use client";

import { FormEvent, useState } from "react";
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
    <div id="setup" className="mx-auto max-w-xl scroll-mt-24 rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
      <ol className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                index <= stepIndex ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-400"
              }`}
            >
              {index + 1}
            </span>
            <span className={index <= stepIndex ? "text-slate-950" : ""}>{label}</span>
            {index < STEPS.length - 1 ? <span className="mx-1 h-px w-6 bg-slate-200" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-8">
        {!wallet ? (
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Connect your institution wallet</h2>
            <p className="mt-2 text-sm text-slate-600">
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
          <div className="h-40 animate-pulse rounded-md bg-slate-50" />
        ) : null}

        {wallet && institution.status === "error" ? (
          <div>
            <p className="text-sm text-slate-700">{institution.message}</p>
            <button
              type="button"
              onClick={refreshInstitution}
              className="mt-3 text-sm font-semibold text-slate-950 underline-offset-4 hover:underline"
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
            <h2 className="text-lg font-semibold text-slate-950">Institution details</h2>
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
              <p role="alert" className="text-sm text-slate-700">
                {submitError}
              </p>
            ) : null}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? "Submitting\u2026" : "Submit for Review"}
              </button>
              {editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-5 text-sm font-semibold text-slate-950 hover:bg-slate-50"
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
        <h2 className="mt-3 text-lg font-semibold text-slate-950">
          {profile.name} is authorized
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Your institution can issue credentials.
        </p>
        <Link
          href="/dashboard/issue"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800"
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
        <h2 className="mt-3 text-lg font-semibold text-slate-950">
          Application submitted
        </h2>
        <p className="mt-2 text-sm text-slate-600">
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
      <h2 className="mt-3 text-lg font-semibold text-slate-950">
        Application not approved
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        {profile.rejectionReason || "Update your details and resubmit."}
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800"
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
  return (
    <div>
      <label className="text-sm font-medium text-slate-800">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
      />
    </div>
  );
}
