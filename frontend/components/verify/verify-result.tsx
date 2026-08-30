"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { buildIndexerQuery, verifyCredential } from "@/lib/api";
import { formatLabel } from "@/lib/format";
import type { VerifyApiResult, VerificationResult } from "@/lib/types";
import { CopyButton } from "@/components/ui/copy-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PublicNav } from "@/components/public/public-nav";
import {
  IconAlertTriangle,
  IconCheck,
  IconWifiOff,
  IconX,
} from "@/components/icons";

type VerifyResultProps = {
  credentialId: string;
  discloseGpa: boolean;
};

const STATUS_CONTENT = {
  VALID: {
    label: "Valid credential",
    badgeTone: "solid" as const,
    icon: IconCheck,
    summary: "The proof verified and the credential is not revoked.",
  },
  REVOKED: {
    label: "Revoked credential",
    badgeTone: "outline" as const,
    icon: IconX,
    summary: "This credential exists, but the issuer has revoked it.",
  },
  INVALID_PROOF: {
    label: "Invalid proof",
    badgeTone: "dashed" as const,
    icon: IconAlertTriangle,
    summary: "A valid proof could not be produced for this credential.",
  },
};

export function VerifyResult({
  credentialId,
  discloseGpa,
}: VerifyResultProps) {
  const requestKey = `${credentialId}:${discloseGpa ? "gpa" : "withheld"}`;
  const [resultState, setResultState] = useState<{
    requestKey: string;
    result: VerifyApiResult;
  } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const result =
    resultState?.requestKey === requestKey ? resultState.result : null;
  const isLoading = result === null;

  useEffect(() => {
    const controller = new AbortController();

    verifyCredential(credentialId, {
      discloseGpa,
      signal: controller.signal,
    })
      .then((nextResult) =>
        setResultState({ requestKey, result: nextResult }),
      )
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setResultState({
          requestKey,
          result: {
            ok: false,
            status: 0,
            error: {
              code: "UNKNOWN_ERROR",
              message:
                "Verification could not be completed. This is a service issue, not a rejection of the credential.",
            },
          },
        });
      });

    return () => controller.abort();
  }, [credentialId, discloseGpa, requestKey]);

  function setGpaDisclosure(nextValue: boolean) {
    router.push(nextValue ? `${pathname}?disclose=gpa` : pathname);
  }

  return (
    <>
      <PublicNav />
      <main className="min-h-screen flex-1 bg-ink-950 px-5 py-8 text-paper sm:px-8">
        <section className="mx-auto w-full max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link
                href="/verify"
                className="text-sm font-semibold text-paper underline-offset-4 hover:underline"
              >
                &larr; Verify another credential
              </Link>
              <h1 className="mt-4 text-3xl font-semibold tracking-normal sm:text-5xl">
                Verification result
              </h1>
            </div>
            <DisclosureToggle
              discloseGpa={discloseGpa}
              onChange={setGpaDisclosure}
            />
          </div>

          <p className="mt-4 break-all text-sm text-paper-dim">
            Credential ID: <span className="font-mono">{credentialId}</span>
          </p>

          {isLoading ? <ProofLoading /> : null}
          {!isLoading && result?.ok ? (
            <VerifiedContent result={result.data} />
          ) : null}
          {!isLoading && result && !result.ok ? (
            <ServiceError
              status={result.status}
              code={result.error.code}
              message={result.error.message}
              requestId={result.error.requestId}
            />
          ) : null}
        </section>
      </main>
    </>
  );
}

function DisclosureToggle({
  discloseGpa,
  onChange,
}: {
  discloseGpa: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-paper/10 bg-ink-900 p-2">
      <legend className="sr-only">GPA disclosure</legend>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          aria-pressed={!discloseGpa}
          onClick={() => onChange(false)}
          className={`min-h-11 rounded-md px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 ${
            !discloseGpa
              ? "bg-gold-500 text-ink-950"
              : "bg-ink-900 text-paper-dim hover:bg-ink-800"
          }`}
        >
          GPA Withheld
        </button>
        <button
          type="button"
          aria-pressed={discloseGpa}
          onClick={() => onChange(true)}
          className={`min-h-11 rounded-md px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 ${
            discloseGpa
              ? "bg-gold-500 text-ink-950"
              : "bg-ink-900 text-paper-dim hover:bg-ink-800"
          }`}
        >
          GPA Disclosed
        </button>
      </div>
    </fieldset>
  );
}

function ProofLoading() {
  return (
    <div
      className="mt-8 rounded-lg border border-dotted border-paper/25 bg-ink-900 p-5"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <div className="mt-1 h-4 w-4 shrink-0 animate-pulse rounded-full bg-gold-500" />
        <div>
          <h2 className="text-lg font-semibold text-paper">
            Generating zero-knowledge proof
          </h2>
          <p className="mt-2 text-sm leading-6 text-paper-dim">
            Verification is CPU-bound and may take longer than a normal lookup.
            This page is waiting for the proof server, indexer, and node to
            respond.
          </p>
        </div>
      </div>
    </div>
  );
}

function VerifiedContent({ result }: { result: VerificationResult }) {
  const status = STATUS_CONTENT[result.status];

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-lg border border-paper/10 bg-ink-900 p-5">
        <StatusBadge
          label={result.status.replace(/_/g, " ")}
          tone={status.badgeTone}
          icon={<status.icon className="h-full w-full" />}
        />
        <h2 className="mt-3 text-2xl font-semibold tracking-normal text-paper">
          {status.label}
        </h2>
        <p className="mt-2 text-sm leading-6 text-paper-dim">{status.summary}</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <FieldPanel title="Disclosed Fields">
          {/* Show ONLY fields that were actually disclosed. A null/empty value
              means the field was not disclosed, and the API already lists it in
              `withheld` — rendering it here too put the same field in both
              panels at once ("GPA — Not disclosed" on the left beside a "Gpa"
              chip on the right). "What was withheld" is the core privacy claim
              this page makes, so the two panels must not disagree.

              Note the explicit null/undefined/"" test rather than a falsy
              check: a real 0 is disclosed data (a 0.00 GPA is a fact, not an
              absence) and must still render. */}
          {(() => {
            const disclosedEntries = Object.entries(result.disclosed).filter(
              ([, value]) => value !== null && value !== undefined && value !== "",
            );

            if (disclosedEntries.length === 0) {
              return (
                <p className="text-sm text-paper-dim">
                  No fields were disclosed for this verification.
                </p>
              );
            }

            return (
              <dl className="space-y-3">
                {disclosedEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex flex-col gap-1 border-b border-paper/10 pb-3 last:border-b-0 last:pb-0"
                  >
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-paper-muted">
                      {formatLabel(key)}
                    </dt>
                    <dd className="break-words text-base font-medium text-paper">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            );
          })()}
        </FieldPanel>

        <FieldPanel title="Withheld Fields">
          {result.withheld.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {result.withheld.map((field) => (
                <li
                  key={field}
                  className="rounded-md border border-dashed border-paper/25 bg-ink-900 px-3 py-2 text-sm font-semibold text-paper"
                >
                  {formatLabel(field)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-paper-dim">
              No fields were withheld for this verification.
            </p>
          )}
        </FieldPanel>
      </section>

      <ProofPanel result={result} />
    </div>
  );
}

function FieldPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-paper/10 bg-ink-900 p-5 shadow-sm">
      <h2 className="text-lg font-semibold tracking-normal text-paper">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProofPanel({ result }: { result: VerificationResult }) {
  const indexerQuery = useMemo(
    () => buildIndexerQuery(result.proof.contractAddress),
    [result.proof.contractAddress],
  );

  return (
    <section className="rounded-lg border border-paper/10 bg-ink-900 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-paper">
            Midnight proof details
          </h2>
          <p className="mt-1 text-sm text-paper-dim">
            Midnight does not use EVM explorer links. These values can be checked
            against the indexer.
          </p>
        </div>
        <CopyButton text={indexerQuery} label="Copy Query" />
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <ProofDatum label="Network ID" value={result.proof.networkId} />
        <ProofDatum
          label="Contract Address"
          value={result.proof.contractAddress}
        />
        <ProofDatum label="Transaction ID" value={result.proof.txId} />
        <ProofDatum label="Proved At" value={result.proof.provedAt} />
        {/* Three states, not two. A failed proof does not reveal which of the
            circuit's asserts tripped, so "No" would be an accusation we cannot
            support — see the note in portal.py. */}
        <ProofDatum
          label="Issuer Authorized"
          value={
            result.proof.issuerAuthorized === null ||
            result.proof.issuerAuthorized === undefined
              ? "Not established by this proof"
              : result.proof.issuerAuthorized
                ? "Yes"
                : "No"
          }
        />
        <ProofDatum
          label="Revoked"
          value={result.proof.revoked ? "Yes" : "No"}
        />
      </dl>

      {/* min-w-0: a grid/flex item defaults to min-width:auto, which refuses
          to shrink below its content — so overflow-x-auto alone did nothing
          and the whole page scrolled sideways on a phone instead. */}
      <pre className="mt-5 min-w-0 overflow-x-auto rounded-md border border-paper/10 bg-ink-800 p-4 text-sm leading-6 text-paper-dim">
        <code>{indexerQuery}</code>
      </pre>
    </section>
  );
}

function ProofDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-paper-muted">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-sm text-paper">{value}</dd>
    </div>
  );
}

function ServiceError({
  status,
  code,
  message,
  requestId,
}: {
  status: number;
  code: string;
  message: string;
  requestId?: string;
}) {
  const isInfrastructureError =
    status === 0 || status === 503 || code === "CHAIN_UNAVAILABLE";

  return (
    <section
      className="mt-8 rounded-lg border border-dotted border-paper/25 bg-ink-900 p-5"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <IconWifiOff className="mt-1 h-6 w-6 shrink-0 text-paper-muted" aria-hidden />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-paper-muted">
            {isInfrastructureError ? "Service error" : code}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-paper">
            Verification could not be completed
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-paper-dim">
            {message}
          </p>
          {requestId ? (
            <p className="mt-4 break-all font-mono text-xs text-paper-muted">
              Request ID: {requestId}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
