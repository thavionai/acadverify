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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
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
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg"
      >
        <h2 id="revoke-modal-title" className="text-lg font-semibold text-slate-950">
          Revoke this certificate?
        </h2>
        <p id="revoke-modal-description" className="mt-2 text-sm text-slate-700">
          This will permanently mark{" "}
          <span className="font-semibold">{credential.studentName}</span>'s{" "}
          {credential.degree} credential as revoked on-chain. This action
          cannot be undone.
        </p>

        {state === "error" ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-slate-950 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={state === "revoking"}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={confirmRevoke}
            disabled={state === "revoking"}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {state === "revoking" ? "Revoking\u2026" : "Confirm Revoke"}
          </button>
        </div>
      </div>
    </div>
  );
}
