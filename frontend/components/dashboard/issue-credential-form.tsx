"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { issueCredential } from "@/lib/api";
import { useWalletContext } from "@/lib/wallet-context";
import { ATTESTATION_KIND_LABELS, ON_CHAIN_HASHED_FIELDS } from "@/lib/types";
import type {
  AttestationInput,
  AttestationKind,
  IssueCredentialInput,
  IssuedCredential,
} from "@/lib/types";
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
  studentEmail: "",
};

// Only the plain-text fields. `attestations` is a repeater with its own state
// and its own row UI, so it must not be reachable from this flat map.
type TextFieldKey = {
  [K in keyof IssueCredentialInput]-?: NonNullable<IssueCredentialInput[K]> extends string
    ? K
    : never;
}[keyof IssueCredentialInput];

const FIELD_CONFIG: Array<{
  key: TextFieldKey;
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
  // Optional, and the label says what happens to it. The address is used once
  // to send the access link and never stored, so leaving it blank simply means
  // the university passes the link on by hand.
  { key: "studentEmail", label: "Student Email (Optional — link is emailed once, never stored)", type: "text", required: false, placeholder: "graduate@example.edu", span: true },
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
  // Separate state, not another FIELD_CONFIG entry: that map is flat strings
  // and this is a variable-length list of four-field rows.
  const [attestations, setAttestations] = useState<AttestationInput[]>([]);
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
    setAttestations([]);
    setFormState({ phase: "editing" });
  }

  function updateAttestation(index: number, patch: Partial<AttestationInput>) {
    setAttestations((rows) =>
      rows.map((row, n) => (n === index ? { ...row, ...patch } : row)),
    );
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

    const result = await issueCredential(
      // Empty rows are how an unused repeater slot looks, not an error — the
      // backend drops them too, but there is no reason to send them.
      { ...input, attestations: attestations.filter((a) => a.title.trim()) },
      wallet,
      { signal: controller.signal },
    ).catch((error) => {
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
      <div className="h-40 animate-pulse rounded-lg border border-paper/10 bg-ink-800" />
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
    (field) => !field.required || (input[field.key] ?? "").trim().length > 0,
  );

  return (
    <section>
      <h1 className="text-2xl font-semibold text-paper">Issue New Credential</h1>
      <p className="mt-1 text-sm text-paper-dim">
        Complete the form below to cryptographically hash and mint a new
        academic credential.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 max-w-3xl rounded-lg border border-paper/10 p-6" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          {FIELD_CONFIG.map((field) => {
            const isHashed = ON_CHAIN_HASHED_FIELDS.includes(field.key);
            return (
              <div key={field.key} className={field.span ? "sm:col-span-2" : ""}>
                <label htmlFor={field.key} className="text-sm font-medium text-paper">
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
                    value={input[field.key] ?? ""}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className="min-h-12 w-full rounded-md border border-paper/20 bg-ink-800 px-3 pr-10 text-base text-paper outline-none transition placeholder:text-paper-muted focus:border-gold-500 focus:bg-ink-700 focus:ring-2 focus:ring-gold-500/10 disabled:opacity-60"
                  />
                  <span
                    aria-hidden
                    title={isHashed ? "Hashed into the on-chain commitment" : "Stored off-chain, not on the ledger"}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-paper-muted"
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

        {/* Everything else this university is attesting. Each row becomes its
            own on-chain credential sharing the student's one access link, so
            the graduate can prove a single course to a single employer without
            handing over the rest of the transcript. */}
        <div className="mt-6 border-t border-paper/10 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-paper">
                Also attest (Optional)
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-paper-muted">
                Courses, honors, activities. Each is issued as its own
                credential the graduate can share separately from the degree.
              </p>
            </div>
            <button
              type="button"
              disabled={isSubmitting || attestations.length >= 10}
              onClick={() =>
                setAttestations((rows) => [
                  ...rows,
                  { kind: "course", title: "", grade: "", year: "" },
                ])
              }
              className="rounded-md border border-paper/20 px-3 py-2 text-sm font-medium text-paper transition hover:border-gold-500 hover:text-gold-500 disabled:opacity-50"
            >
              Add attestation
            </button>
          </div>

          {attestations.length > 0 && (
            <ul className="mt-4 flex flex-col gap-3">
              {attestations.map((row, index) => (
                <li
                  key={index}
                  className="grid gap-3 rounded-md border border-paper/10 bg-ink-800/50 p-3 sm:grid-cols-[9rem_1fr_5rem_5rem_auto]"
                >
                  <select
                    aria-label={`Attestation ${index + 1} type`}
                    value={row.kind}
                    disabled={isSubmitting}
                    onChange={(event) =>
                      updateAttestation(index, {
                        kind: event.target.value as AttestationKind,
                      })
                    }
                    className="min-h-11 rounded-md border border-paper/20 bg-ink-800 px-2 text-sm text-paper outline-none focus:border-gold-500"
                  >
                    {Object.entries(ATTESTATION_KIND_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Attestation ${index + 1} title`}
                    value={row.title}
                    disabled={isSubmitting}
                    onChange={(event) =>
                      updateAttestation(index, { title: event.target.value })
                    }
                    placeholder="Distributed Systems"
                    className="min-h-11 rounded-md border border-paper/20 bg-ink-800 px-3 text-sm text-paper outline-none placeholder:text-paper-muted focus:border-gold-500"
                  />
                  <input
                    aria-label={`Attestation ${index + 1} grade`}
                    value={row.grade}
                    disabled={isSubmitting}
                    onChange={(event) =>
                      updateAttestation(index, { grade: event.target.value })
                    }
                    placeholder="3.8"
                    inputMode="decimal"
                    className="min-h-11 rounded-md border border-paper/20 bg-ink-800 px-3 text-sm text-paper outline-none placeholder:text-paper-muted focus:border-gold-500"
                  />
                  <input
                    aria-label={`Attestation ${index + 1} year`}
                    value={row.year}
                    disabled={isSubmitting}
                    onChange={(event) =>
                      updateAttestation(index, { year: event.target.value })
                    }
                    placeholder="2025"
                    inputMode="decimal"
                    className="min-h-11 rounded-md border border-paper/20 bg-ink-800 px-3 text-sm text-paper outline-none placeholder:text-paper-muted focus:border-gold-500"
                  />
                  <button
                    type="button"
                    aria-label={`Remove attestation ${index + 1}`}
                    disabled={isSubmitting}
                    onClick={() =>
                      setAttestations((rows) => rows.filter((_, n) => n !== index))
                    }
                    className="min-h-11 rounded-md px-3 text-sm text-paper-muted transition hover:text-danger-400 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {attestations.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-paper-muted">
              A grade the ledger cannot store as a number — a letter grade, or
              nothing at all — is simply left off. The attestation is still
              issued, and the grade can be written into the title instead.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-paper/10 pt-4 text-xs text-paper-muted">
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
            className="mt-4 rounded-md border border-danger-500/60 bg-danger-500/10 px-3 py-2 text-sm text-paper"
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
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-gold-500 px-6 text-sm font-semibold text-ink-950 transition hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-paper-muted"
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
    <section className="rounded-lg border border-paper/10 bg-ink-900 p-8 text-center">
      <h1 className="text-lg font-semibold text-paper">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-paper-dim">{description}</p>
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
      className="rounded-lg border border-dotted border-paper/25 bg-ink-900 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-paper">
          Issuing credential&hellip; {(elapsedMs / 1000).toFixed(0)}s
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold text-paper underline-offset-4 hover:underline"
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
                  ? "bg-gold-500"
                  : index === activeIndex
                    ? "animate-pulse bg-gold-500"
                    : "bg-paper/15"
              }`}
            />
            <span className={index <= activeIndex ? "text-paper" : "text-paper-muted"}>
              {phase.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-paper-muted">
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
    <section className="max-w-3xl rounded-lg border border-gold-500 bg-ink-900 p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-paper-muted">
        Credential issued
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-paper">Ready to share</h2>
      <p className="mt-2 text-sm text-paper-dim">
        Print or send this to the student. Scanning the QR code opens the public
        verification page for this credential.
      </p>

      {/* The backend generates and stores a real QR PNG at issue time and
          returns its URL; it simply was never rendered, so the issuer could
          only copy a link and the issue -> certificate -> scan path could not
          be completed from the UI at all. */}
      {credential.qrCodeUrl ? (
        <div className="mt-5 flex justify-center rounded-md border border-paper/10 p-4">
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

      <dl className="mt-5 grid gap-4 rounded-md border border-paper/10 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-paper-muted">
            Credential ID
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-paper">{credential.id}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-paper-muted">
            Commitment Hash
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-paper">
            {credential.commitmentHash}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-paper-muted">
            Transaction ID
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-paper">{credential.txId}</dd>
        </div>
        {/* Only render when there is actually a CID. This build has no IPFS,
            so the backend always returns "" and the row rendered as a label
            with nothing under it — which reads as broken rather than absent. */}
        {credential.metadataCid ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-paper-muted">
              Metadata CID
            </dt>
            <dd className="mt-1 break-all font-mono text-sm text-paper">
              {credential.metadataCid}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-paper-muted">
        Public verification link
      </p>
      <div className="mt-2 flex flex-col gap-2 rounded-md border border-paper/10 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="break-all font-mono text-sm text-paper">{credential.verifyUrl}</p>
        <CopyButton text={credential.verifyUrl} label="Copy Link" />
      </div>

      {/* The graduate's own link. Deliberately separated from the public one
          above and marked with the danger colour: handing this to the wrong
          person gives them the GPA and the ability to mint share links. The
          server keeps only a hash, so it genuinely cannot be reissued. */}
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-gold-500">
        Student access link
      </p>
      <div className="mt-2 flex flex-col gap-2 rounded-md border border-gold-500/40 bg-gold-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="break-all font-mono text-sm text-paper">{credential.holdUrl}</p>
        <CopyButton text={credential.holdUrl} label="Copy Student Link" />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-danger-400">
        Give this to the graduate and no one else. It lets them see their own
        GPA and choose what each employer is shown. It is shown once — nothing
        on the server can produce it again.
      </p>

      {/* Only ever rendered when an address was actually given. `false` is the
          case that matters: the credential is on-chain, the link above is the
          only copy, and nobody has it yet. */}
      {credential.emailSent === true && (
        <p className="mt-2 text-sm leading-relaxed text-gold-500">
          Emailed to the student. The address was used once and not stored.
        </p>
      )}
      {credential.emailSent === false && (
        <p className="mt-2 text-sm font-semibold leading-relaxed text-danger-400">
          The email could not be sent. Copy the link above and give it to the
          graduate yourself — this is the only copy.
        </p>
      )}

      {/* Per-item, because one attestation can be rejected while the rest
          succeed. A failure here is not fatal — the degree is issued and its
          link is above — but it must not be quiet either. */}
      {credential.attestations && credential.attestations.length > 0 && (
        <>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-paper-muted">
            Also attested
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {credential.attestations.map((attestation) => (
              <li
                key={attestation.id || attestation.title}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-paper/10 p-3"
              >
                <span className="text-sm text-paper">
                  <span className="text-paper-muted">
                    {ATTESTATION_KIND_LABELS[attestation.kind]}
                  </span>{" "}
                  {attestation.title}
                </span>
                {attestation.ok ? (
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-gold-500">
                      Recorded on-chain
                    </span>
                    <CopyButton text={attestation.verifyUrl} label="Copy Link" />
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-danger-400">
                    Not issued — submit this one again
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onIssueAnother}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-gold-500 px-4 text-sm font-semibold text-ink-950 transition hover:bg-gold-400"
        >
          Issue another credential
        </button>
        {/* Must be a client-side Link: a plain <a> full-reloads the app and
            drops the in-memory wallet connection, hiding the registry the
            user was just sent to. */}
        <Link
          href="/dashboard/registry"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-paper/20 px-4 text-sm font-semibold text-paper transition hover:bg-ink-850"
        >
          View in Registry
        </Link>
      </div>
    </section>
  );
}
