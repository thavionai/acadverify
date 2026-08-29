"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { issueCredential } from "@/lib/api";
import { useWalletContext } from "@/lib/wallet-context";
import { ON_CHAIN_HASHED_FIELDS } from "@/lib/types";
import type { IssueCredentialInput, IssuedCredential } from "@/lib/types";
import { CopyButton } from "@/components/ui/copy-button";
import { IconAward, IconLock, IconGlobe } from "@/components/icons";

const EMPTY_INPUT: IssueCredentialInput = {
  studentName: "",
  studentId: "",
  degree: "",
  institution: "",
  major: "",
  graduationDate: "",
  honors: "",
  gpa: "",
};

const FIELD_CONFIG: Array<{
  key: keyof IssueCredentialInput;
  label: string;
  type: "text" | "date";
  required: boolean;
  placeholder?: string;
  inputMode?: "text" | "decimal";
  span?: boolean;
}> = [
  { key: "studentName", label: "Student Full Name", type: "text", required: true, placeholder: "Jane Doe" },
  { key: "studentId", label: "Student ID", type: "text", required: true, placeholder: "102938475" },
  { key: "degree", label: "Degree Program", type: "text", required: true, placeholder: "Bachelor of Science", span: true },
  { key: "graduationDate", label: "Graduation Date", type: "date", required: true },
  { key: "institution", label: "Institution", type: "text", required: true, placeholder: "University of Ghana", span: true },
  { key: "major", label: "Major", type: "text", required: true, placeholder: "Computer Science", span: true },
  { key: "honors", label: "Honors (Optional)", type: "text", required: false, placeholder: "Summa Cum Laude" },
  { key: "gpa", label: "Cumulative GPA", type: "text", required: true, placeholder: "3.95", inputMode: "decimal" },
];

// These are elapsed-time labels, not real progress events — the API is a single
// request and reports no intermediate state. They must therefore only describe
// steps that genuinely happen. The first previously read "Uploading credential
// metadata to IPFS"; there is no IPFS anywhere in this system (portal.py returns
// an empty metadataCid), so it announced work that never occurred.
const ISSUE_PHASES = [
  { label: "Preparing the credential commitment", afterMs: 0 },
  { label: "Generating the zero-knowledge proof", afterMs: 2200 },
  { label: "Submitting the transaction to Midnight", afterMs: 5500 },
];

type FormState =
  | { phase: "editing" }
  | { phase: "submitting"; elapsedMs: number }
  | { phase: "success"; credential: IssuedCredential }
  | { phase: "error"; message: string };

export function IssueCredentialForm() {
  const { wallet, institution } = useWalletContext();
  const [input, setInput] = useState<IssueCredentialInput>(EMPTY_INPUT);
  const [formState, setFormState] = useState<FormState>({ phase: "editing" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (formState.phase !== "submitting") return;

    const startedAt = Date.now() - formState.elapsedMs;
    const timer = window.setInterval(() => {
      setFormState((current) =>
        current.phase === "submitting"
          ? { phase: "submitting", elapsedMs: Date.now() - startedAt }
          : current,
      );
    }, 250);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.phase === "submitting"]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function updateField(key: keyof IssueCredentialInput, value: string) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setInput(EMPTY_INPUT);
    setFormState({ phase: "editing" });
  }

  function cancelSubmit() {
    abortRef.current?.abort();
    setFormState({ phase: "editing" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setFormState({ phase: "submitting", elapsedMs: 0 });

    const result = await issueCredential(input, wallet, {
      signal: controller.signal,
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }
      throw error;
    });

    if (result === null) return;

    if (result.ok) {
      setFormState({ phase: "success", credential: result.data });
    } else {
      setFormState({ phase: "error", message: result.error.message });
    }
  }

  if (!wallet) {
    return (
      <GatedPanel
        title="Connect your issuer wallet"
        description="Issuing writes a signed commitment on behalf of your institution, so a connected Midnight wallet is required before this form unlocks."
      />
    );
  }

  if (institution.status === "loading" || institution.status === "idle") {
    return (
      <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
    );
  }

  if (institution.status === "loaded" && institution.profile.status !== "AUTHORIZED") {
    return (
      <GatedPanel
        title="Issuer authorization required"
        description={
          institution.profile.status === "PENDING_REVIEW"
            ? "Your institution's registration is still being reviewed. You'll be able to issue credentials once it's authorized."
            : "Complete your institution's setup before issuing credentials."
        }
      />
    );
  }

  if (formState.phase === "success") {
    return (
      <IssueSuccess credential={formState.credential} onIssueAnother={resetForm} />
    );
  }

  const isSubmitting = formState.phase === "submitting";
  const isValid = FIELD_CONFIG.every(
    (field) => !field.required || input[field.key].trim().length > 0,
  );

  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-950">Issue New Credential</h1>
      <p className="mt-1 text-sm text-slate-600">
        Complete the form below to cryptographically hash and mint a new
        academic credential.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 max-w-3xl rounded-lg border border-slate-200 p-6" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          {FIELD_CONFIG.map((field) => {
            const isHashed = ON_CHAIN_HASHED_FIELDS.includes(field.key);
            return (
              <div key={field.key} className={field.span ? "sm:col-span-2" : ""}>
                <label htmlFor={field.key} className="text-sm font-medium text-slate-800">
                  {field.label}
                </label>
                <div className="relative mt-2">
                  <input
                    id={field.key}
                    name={field.key}
                    type={field.type}
                    inputMode={field.inputMode}
                    required={field.required}
                    disabled={isSubmitting}
                    value={input[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className="min-h-12 w-full rounded-md border border-slate-300 bg-slate-50 px-3 pr-10 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:bg-white focus:ring-2 focus:ring-slate-950/10 disabled:opacity-60"
                  />
                  <span
                    aria-hidden
                    title={isHashed ? "Hashed into the on-chain commitment" : "Stored off-chain, not on the ledger"}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {isHashed ? (
                      <IconLock className="h-4 w-4" />
                    ) : (
                      <IconGlobe className="h-4 w-4" />
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <IconLock className="h-3.5 w-3.5" aria-hidden /> Hashed into the
            on-chain commitment
          </span>
          <span className="flex items-center gap-1.5">
            <IconGlobe className="h-3.5 w-3.5" aria-hidden /> Stored off-chain,
            not on the ledger
          </span>
        </div>

        {formState.phase === "error" ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-slate-950 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {formState.message}
          </p>
        ) : null}

        <div className="mt-6">
          {isSubmitting ? (
            <IssueProgress elapsedMs={formState.elapsedMs} onCancel={cancelSubmit} />
          ) : (
            <button
              type="submit"
              disabled={!isValid}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <IconAward className="h-4 w-4" aria-hidden />
              Submit &amp; Mint Credential
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function GatedPanel({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-950">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{description}</p>
    </section>
  );
}

function IssueProgress({
  elapsedMs,
  onCancel,
}: {
  elapsedMs: number;
  onCancel: () => void;
}) {
  const activeIndex = ISSUE_PHASES.reduce(
    (acc, phase, index) => (elapsedMs >= phase.afterMs ? index : acc),
    0,
  );

  return (
    <div
      className="rounded-lg border border-dotted border-slate-400 bg-white p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950">
          Issuing credential&hellip; {(elapsedMs / 1000).toFixed(0)}s
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold text-slate-950 underline-offset-4 hover:underline"
        >
          Cancel
        </button>
      </div>
      <ol className="mt-3 space-y-2">
        {ISSUE_PHASES.map((phase, index) => (
          <li key={phase.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${
                index < activeIndex
                  ? "bg-slate-950"
                  : index === activeIndex
                    ? "animate-pulse bg-slate-950"
                    : "bg-slate-200"
              }`}
            />
            <span className={index <= activeIndex ? "text-slate-950" : "text-slate-400"}>
              {phase.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-slate-500">
        Proof generation and network conditions vary — these steps are an
        estimate, not a guarantee. This request is still in flight either way.
      </p>
    </div>
  );
}

function IssueSuccess({
  credential,
  onIssueAnother,
}: {
  credential: IssuedCredential;
  onIssueAnother: () => void;
}) {
  return (
    <section className="max-w-3xl rounded-lg border border-slate-950 bg-white p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
        Credential issued
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">Ready to share</h2>
      <p className="mt-2 text-sm text-slate-600">
        Print or send this to the student. Scanning the QR code opens the public
        verification page for this credential.
      </p>

      {/* The backend generates and stores a real QR PNG at issue time and
          returns its URL; it simply was never rendered, so the issuer could
          only copy a link and the issue -> certificate -> scan path could not
          be completed from the UI at all. */}
      {credential.qrCodeUrl ? (
        <div className="mt-5 flex justify-center rounded-md border border-slate-200 p-4">
          {/* Plain <img>, not next/image: this is a runtime-generated URL on a
              storage host that is not in the Next image config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={credential.qrCodeUrl}
            alt={`QR code linking to the public verification page for credential ${credential.id}`}
            width={192}
            height={192}
            className="h-48 w-48"
          />
        </div>
      ) : null}

      <dl className="mt-5 grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Credential ID
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-slate-950">{credential.id}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Commitment Hash
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-slate-950">
            {credential.commitmentHash}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Transaction ID
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-slate-950">{credential.txId}</dd>
        </div>
        {/* Only render when there is actually a CID. This build has no IPFS,
            so the backend always returns "" and the row rendered as a label
            with nothing under it — which reads as broken rather than absent. */}
        {credential.metadataCid ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Metadata CID
            </dt>
            <dd className="mt-1 break-all font-mono text-sm text-slate-950">
              {credential.metadataCid}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-col gap-2 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="break-all font-mono text-sm text-slate-950">{credential.verifyUrl}</p>
        <CopyButton text={credential.verifyUrl} label="Copy Link" />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onIssueAnother}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Issue another credential
        </button>
        <a
          href="/dashboard/registry"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-50"
        >
          View in Registry
        </a>
      </div>
    </section>
  );
}
