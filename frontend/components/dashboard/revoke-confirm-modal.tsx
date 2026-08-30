"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { revokeCredential } from "@/lib/api";
import type { CredentialListItem, WalletConnection } from "@/lib/types";

export function RevokeConfirmModal({
  credential,
  wallet,
  onCancel,
  onRevoked,
  triggerRef,
}: {
  credential: CredentialListItem;
  wallet: WalletConnection;
  onCancel: () => void;
  onRevoked: (credentialId: string) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [state, setState] = useState<"idle" | "revoking" | "error">("idle");
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    onCancel();
    triggerRef.current?.focus();
  }

  async function confirmRevoke() {
    setState("revoking");
    setError("");

    const result = await revokeCredential(credential.id, wallet);

    if (result.ok) {
      onRevoked(credential.id);
      triggerRef.current?.focus();
    } else {
      setState("error");
      setError(result.error.message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="revoke-modal-title"
        aria-describedby="revoke-modal-description"
        className="w-full max-w-md rounded-lg border border-paper/10 bg-ink-900 p-6 shadow-lg"
      >
        <h2 id="revoke-modal-title" className="text-lg font-semibold text-paper">
          Revoke this certificate?
        </h2>
        {/* studentName is always empty here — the registry index deliberately
            never stores student identity (docs/data-model.md) — so this
            rendered as a bare "mark 's Master of ... credential". Name the
            credential itself rather than an absent person. */}
        <p id="revoke-modal-description" className="mt-2 text-sm text-paper-dim">
          {credential.studentName ? (
            <>
              This will permanently mark{" "}
              <span className="font-semibold">{credential.studentName}</span>
              &apos;s {credential.degree} credential as revoked on-chain.
            </>
          ) : (
            <>
              This will permanently mark this{" "}
              <span className="font-semibold">{credential.degree}</span>{" "}
              credential as revoked on-chain.
            </>
          )}{" "}
          This action cannot be undone.
        </p>

        {state === "error" ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-danger-500/60 bg-danger-500/10 px-3 py-2 text-sm text-paper"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={state === "revoking"}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-paper/20 bg-ink-900 px-4 text-sm font-semibold text-paper transition hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={confirmRevoke}
            disabled={state === "revoking"}
            /* Revocation is the one destructive action in the product and it is
                irreversible on-chain, so it takes the danger colour rather than
                the gold primary. Red is reserved for exactly this and for the
                REVOKED / INVALID states it produces. */
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-danger-500 px-4 text-sm font-semibold text-ink-950 transition hover:bg-danger-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-paper-muted"
          >
            {state === "revoking" ? "Revoking\u2026" : "Confirm Revoke"}
          </button>
        </div>
      </div>
    </div>
  );
}
