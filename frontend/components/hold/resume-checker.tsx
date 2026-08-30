"use client";

import { useState } from "react";
import { checkResume } from "@/lib/api";
import { redactPII } from "@/lib/redact";
import type { ClaimVerdict, ResumeCheckResult } from "@/lib/types";

/**
 * Separate what a résumé claims from what the credential proves.
 *
 * Two textareas on purpose. The first is where the student pastes; the second
 * shows exactly what will be sent for extraction, pre-redacted and editable.
 * A privacy product that quietly ships a résumé to a third party would be
 * arguing against itself, so the transfer is made visible and editable rather
 * than described in a footnote.
 */

const VERDICT_STYLES: Record<ClaimVerdict, { chip: string; label: string }> = {
  // Gold is the product's mark of authenticity — the same colour the VALID
  // badge uses.
  proven: { chip: "border-gold-500 bg-gold-500 text-ink-950", label: "Proven" },
  // Red stays reserved for a real conflict, never for "we don't know".
  contradicted: {
    chip: "border-danger-500 bg-danger-500/10 text-danger-400",
    label: "Contradicted",
  },
  unproven: {
    chip: "border-paper/25 bg-ink-800 text-paper-dim",
    label: "Not covered",
  },
};

type State =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "done"; result: ResumeCheckResult }
  | { phase: "error"; message: string };

export function ResumeChecker({ token }: { token: string }) {
  const [pasted, setPasted] = useState("");
  const [outgoing, setOutgoing] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  function handlePaste(value: string) {
    setPasted(value);
    setOutgoing(redactPII(value));
    setState({ phase: "idle" });
  }

  async function run() {
    setState({ phase: "checking" });
    const result = await checkResume(token, outgoing);
    setState(
      result.ok
        ? { phase: "done", result: result.data }
        : { phase: "error", message: result.error.message },
    );
  }

  const canCheck = outgoing.trim().length > 0 && state.phase !== "checking";

  return (
    <section className="rounded-lg border border-paper/10 bg-ink-900 p-6 sm:p-8">
      <h2 className="text-xl font-semibold text-paper">
        Check your r&eacute;sum&eacute; against this credential
      </h2>
      <p className="mt-2 max-w-2xl text-pretty leading-relaxed text-paper-dim">
        Paste your education section. Every claim it makes is checked against
        what this credential actually proves &mdash; so you find out what an
        employer could confirm before they ask.
      </p>

      <label htmlFor="resume-input" className="mt-6 block text-sm font-medium text-paper">
        Your r&eacute;sum&eacute; text
      </label>
      <textarea
        id="resume-input"
        value={pasted}
        onChange={(event) => handlePaste(event.target.value)}
        rows={6}
        placeholder="EDUCATION&#10;BSc Computer Science, North Valley University, 2026. GPA 3.9"
        className="mt-2 w-full rounded-md border border-paper/20 bg-ink-800 p-3 text-sm text-paper outline-none transition placeholder:text-paper-muted focus:border-gold-500 focus:ring-2 focus:ring-gold-500/10"
      />

      {pasted.trim() ? (
        <>
          <label htmlFor="resume-outgoing" className="mt-6 block text-sm font-medium text-paper">
            Exactly this text will be sent
          </label>
          <p className="mt-1 text-sm text-paper-muted">
            Emails, phone numbers and profile links have been removed
            automatically. Edit anything else you would rather not send.
          </p>
          <textarea
            id="resume-outgoing"
            value={outgoing}
            onChange={(event) => setOutgoing(event.target.value)}
            rows={6}
            className="mt-2 w-full rounded-md border border-gold-500/40 bg-ink-800 p-3 font-mono text-sm text-paper outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/10"
          />
        </>
      ) : null}

      <button
        type="button"
        onClick={run}
        disabled={!canCheck}
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-md bg-gold-500 px-6 text-sm font-semibold text-ink-950 transition hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-paper-muted"
      >
        {state.phase === "checking" ? "Checking…" : "Check against my credential"}
      </button>

      {state.phase === "checking" ? (
        <p className="mt-4 text-sm text-paper-dim">
          Proving the credential and reading your claims. This takes a few
          seconds.
        </p>
      ) : null}

      {state.phase === "error" ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger-500/60 bg-danger-500/10 px-3 py-2 text-sm text-paper"
        >
          {state.message}
        </p>
      ) : null}

      {state.phase === "done" ? (
        <div className="mt-6">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(VERDICT_STYLES) as ClaimVerdict[]).map((verdict) => (
              <span
                key={verdict}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${VERDICT_STYLES[verdict].chip}`}
              >
                {state.result.summary[verdict] ?? 0} {VERDICT_STYLES[verdict].label}
              </span>
            ))}
          </div>

          {state.result.claims.length === 0 ? (
            <p className="mt-5 text-sm text-paper-dim">
              No education claims were found in that text.
            </p>
          ) : (
            <ul className="mt-5 space-y-3">
              {state.result.claims.map((claim, index) => (
                <li
                  key={`${claim.type}-${index}`}
                  className="rounded-md border border-paper/10 bg-ink-950 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-sm font-medium text-paper">
                      &ldquo;{claim.text}&rdquo;
                    </p>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.06em] ${VERDICT_STYLES[claim.verdict].chip}`}
                    >
                      {VERDICT_STYLES[claim.verdict].label}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-paper-muted">{claim.reason}</p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-6 text-sm leading-relaxed text-paper-muted">
            Claims are checked against the credential proved on-chain. The model
            only reads the text &mdash; it decides nothing.
          </p>
        </div>
      ) : null}
    </section>
  );
}
