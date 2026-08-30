"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicNav } from "@/components/public/public-nav";
import { ResumeChecker } from "@/components/hold/resume-checker";
import { CopyButton } from "@/components/ui/copy-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { IconAlertTriangle, IconCheck, IconX } from "@/components/icons";
import { createShareGrant, getHolderPortal, revokeShareGrant } from "@/lib/api";
import { formatDate, formatDisclosedValue } from "@/lib/format";
import type { HolderPortalData } from "@/lib/types";

/**
 * The graduate's own view.
 *
 * Access is possession of the link the university handed them — no account, no
 * password, nothing for them to lose or for us to store. The token stays in the
 * URL the browser holds and travels to the API in a header, never a request
 * path, because request paths are written to the server's access log.
 */

const STATUS_CONTENT = {
  VALID: {
    label: "Valid",
    tone: "solid" as const,
    icon: IconCheck,
    summary: "This credential verifies. You control what each employer sees below.",
  },
  REVOKED: {
    label: "Revoked",
    tone: "outline" as const,
    icon: IconX,
    summary:
      "Your institution has revoked this credential. Share links will no longer disclose anything.",
  },
  INVALID_PROOF: {
    label: "Invalid proof",
    tone: "dashed" as const,
    icon: IconAlertTriangle,
    summary:
      "A valid proof could not be produced for this credential. Contact your institution.",
  },
};

type Load =
  | { phase: "loading" }
  | { phase: "ready"; data: HolderPortalData }
  | { phase: "error"; message: string };

export function HolderView({ token }: { token: string }) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const result = await getHolderPortal(token, { signal });
      if (signal?.aborted) return;
      setLoad(
        result.ok
          ? { phase: "ready", data: result.data }
          : { phase: "error", message: result.error.message },
      );
    },
    [token],
  );

  useEffect(() => {
    const controller = new AbortController();
    // lib/api.ts re-throws AbortError so callers can tell a cancelled request
    // from a failed one, which means every caller has to catch it.
    refresh(controller.signal).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    });
    return () => controller.abort();
  }, [refresh]);

  async function share(revealGpa: boolean) {
    setBusy(true);
    await createShareGrant(token, revealGpa);
    await refresh();
    setBusy(false);
  }

  async function revoke(grantId: string) {
    setBusy(true);
    await revokeShareGrant(token, grantId);
    await refresh();
    setBusy(false);
  }

  return (
    <>
      <PublicNav />
      <main className="min-h-screen flex-1 bg-ink-950 px-5 py-8 text-paper sm:px-8">
        <section className="mx-auto w-full max-w-4xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Your credential
          </h1>
          <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-paper-dim">
            Only you can open this page. Anyone you share a link with sees
            exactly what you chose to include &mdash; and nothing else.
          </p>

          {load.phase === "loading" ? (
            <p className="mt-10 rounded-lg border border-dotted border-paper/25 bg-ink-900 p-5 text-sm text-paper-dim">
              Proving your credential&hellip; this takes a moment.
            </p>
          ) : null}

          {load.phase === "error" ? (
            <div
              role="alert"
              className="mt-10 rounded-lg border border-danger-500/60 bg-danger-500/10 p-5"
            >
              <h2 className="text-lg font-semibold text-paper">
                This link does not open a credential
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-paper-dim">
                {load.message} If your university issued your credential before
                student access existed, ask them to issue a new one.
              </p>
            </div>
          ) : null}

          {load.phase === "ready" ? (
            <div className="mt-10 space-y-8">
              <CredentialCard data={load.data} />
              <ShareLinks
                data={load.data}
                busy={busy}
                onShare={share}
                onRevoke={revoke}
              />
              <ResumeChecker token={token} />
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}

function CredentialCard({ data }: { data: HolderPortalData }) {
  const { credential } = data;
  const status = STATUS_CONTENT[credential.status] ?? STATUS_CONTENT.INVALID_PROOF;

  return (
    <section className="rounded-lg border border-paper/10 bg-ink-900 p-6 sm:p-8">
      <StatusBadge
        label={status.label}
        tone={status.tone}
        icon={<status.icon className="h-3.5 w-3.5" />}
      />
      <p className="mt-3 text-sm leading-relaxed text-paper-dim">{status.summary}</p>

      <dl className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="Institution" value={credential.institution} />
        <Field label="Degree" value={credential.degree} />
        <Field
          label="Graduation year"
          value={credential.graduationYear ? String(credential.graduationYear) : null}
        />
        <Field
          label="GPA"
          value={
            credential.gpa === null
              ? null
              : formatDisclosedValue("gpa", credential.gpa)
          }
        />
      </dl>

      <p className="mt-6 border-t border-paper/10 pt-4 text-sm text-paper-muted">
        Issued {formatDate(credential.issuedAt)} &middot;{" "}
        <span className="font-mono">{credential.id}</span>
      </p>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-paper-muted">
        {label}
      </dt>
      <dd className="mt-1 text-base font-medium text-paper">
        {/* A failed proof discloses nothing, including to the holder. Saying so
            is more honest than rendering a blank. */}
        {value ?? (
          <span className="text-paper-muted">Not currently provable</span>
        )}
      </dd>
    </div>
  );
}

function ShareLinks({
  data,
  busy,
  onShare,
  onRevoke,
}: {
  data: HolderPortalData;
  busy: boolean;
  onShare: (revealGpa: boolean) => void;
  onRevoke: (grantId: string) => void;
}) {
  const live = data.grants.filter((grant) => !grant.revoked);
  const revoked = data.grants.filter((grant) => grant.revoked);

  return (
    <section className="rounded-lg border border-paper/10 bg-ink-900 p-6 sm:p-8">
      <h2 className="text-xl font-semibold text-paper">Share links</h2>
      <p className="mt-2 max-w-2xl text-pretty leading-relaxed text-paper-dim">
        Make one link per employer. Each carries only what you chose, and you
        can switch it off the moment they no longer need it.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onShare(false)}
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-paper/25 px-5 text-sm font-semibold text-paper transition hover:border-gold-500 hover:text-gold-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Share without GPA
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onShare(true)}
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-gold-500 px-5 text-sm font-semibold text-ink-950 transition hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-paper-muted"
        >
          Share including GPA
        </button>
      </div>

      {live.length === 0 ? (
        <p className="mt-6 text-sm text-paper-muted">
          You have not shared this credential with anyone yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {live.map((grant) => (
            <li
              key={grant.grantId}
              className="rounded-md border border-paper/10 bg-ink-950 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-paper">
                  {grant.revealGpa ? "Includes your GPA" : "GPA withheld"}
                </span>
                <span className="text-xs text-paper-muted">
                  created {formatDate(grant.createdAt)}
                </span>
              </div>
              <p className="mt-2 break-all font-mono text-sm text-paper-dim">
                {grant.verifyUrl}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={grant.verifyUrl} label="Copy link" />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRevoke(grant.grantId)}
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-danger-500/60 px-3 text-sm font-semibold text-danger-400 transition hover:bg-danger-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {revoked.length > 0 ? (
        <p className="mt-5 text-sm text-paper-muted">
          {revoked.length} link{revoked.length === 1 ? "" : "s"} revoked. Anyone
          opening {revoked.length === 1 ? "it" : "them"} now sees nothing.
        </p>
      ) : null}
    </section>
  );
}
