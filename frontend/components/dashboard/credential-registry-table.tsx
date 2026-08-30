"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { downloadCertificate, listCredentials } from "@/lib/api";
import { formatDate, truncateMiddle } from "@/lib/format";
import { useWalletContext } from "@/lib/wallet-context";
import type { CredentialListItem, CredentialStatusFilter } from "@/lib/types";
import { CopyButton } from "@/components/ui/copy-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { RevokeConfirmModal } from "@/components/dashboard/revoke-confirm-modal";
import { IconCheck, IconX } from "@/components/icons";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; items: CredentialListItem[] }
  | { status: "error"; message: string };

export function CredentialRegistryTable() {
  const { wallet } = useWalletContext();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CredentialStatusFilter>("ALL");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [revokeTarget, setRevokeTarget] = useState<CredentialListItem | null>(null);
  const [downloadError, setDownloadError] = useState<{ id: string; message: string } | null>(null);
  const revokeTriggerRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!wallet) return;

    const controller = new AbortController();
    setLoadState({ status: "loading" });

    listCredentials(wallet, {
      search: debouncedSearch,
      status: statusFilter,
      signal: controller.signal,
    })
      .then((result) => {
        if (result.ok) {
          setLoadState({ status: "loaded", items: result.data.items });
        } else {
          setLoadState({ status: "error", message: result.error.message });
        }
      })
      .catch((error) => {
        // The cleanup below aborts any in-flight request, and lib/api.ts
        // deliberately re-throws AbortError. Without this catch every search
        // keystroke, filter change, and navigation away logged an unhandled
        // rejection. An abort is us cancelling our own request — not an error
        // the user should ever see. Same handling as verify-result.tsx.
        if (error instanceof DOMException && error.name === "AbortError") return;

        setLoadState({
          status: "error",
          message:
            "The credential registry could not be loaded. This is a service issue, not a problem with any credential.",
        });
      });

    return () => controller.abort();
  }, [wallet, debouncedSearch, statusFilter]);

  function applyRevoked(credentialId: string) {
    setLoadState((current) =>
      current.status === "loaded"
        ? {
            status: "loaded",
            items: current.items.map((item) =>
              item.id === credentialId ? { ...item, status: "REVOKED" } : item,
            ),
          }
        : current,
    );
    setRevokeTarget(null);
  }

  async function handleDownload(item: CredentialListItem) {
    if (!wallet) return;
    setDownloadError(null);

    const result = await downloadCertificate(item, wallet);

    if (!result.ok) {
      setDownloadError({ id: item.id, message: result.message });
    }
  }

  if (!wallet) {
    return (
      <section className="rounded-lg border border-paper/10 bg-ink-900 p-8 text-center">
        <h1 className="text-lg font-semibold text-paper">
          Connect your issuer wallet
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-paper-dim">
          The registry is scoped to credentials issued by your institution's
          wallet, so it's hidden until you connect.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold text-paper">Issued Credential Registry</h1>
      <p className="mt-1 text-sm text-paper-dim">
        Search, download certificates, or revoke credentials your institution
        has issued.
      </p>

      <div className="mt-6 rounded-lg border border-paper/10">
        <div className="flex flex-col gap-3 border-b border-paper/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <label htmlFor="registry-search" className="sr-only">
              Search credentials
            </label>
            <input
              id="registry-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by student name, ID, or degree"
              className="min-h-11 w-full max-w-sm rounded-md border border-paper/20 bg-ink-800 px-3 text-sm text-paper outline-none transition placeholder:text-paper-muted focus:border-gold-500 focus:ring-2 focus:ring-gold-500/10"
            />
          </div>
          <div>
            <label htmlFor="registry-filter" className="sr-only">
              Filter by status
            </label>
            <select
              id="registry-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as CredentialStatusFilter)}
              className="min-h-11 rounded-md border border-paper/20 bg-ink-800 px-3 text-sm text-paper outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/10"
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>
        </div>

        {loadState.status === "loading" ? <RegistrySkeleton /> : null}

        {loadState.status === "error" ? (
          <p role="alert" className="p-6 text-sm text-danger-400">
            {loadState.message}
          </p>
        ) : null}

        {loadState.status === "loaded" && loadState.items.length === 0 ? (
          <p className="p-6 text-sm text-paper-dim">No credentials match your search.</p>
        ) : null}

        {/* The table wrapper carries `contain-paint` as well as
            `overflow-x-auto`. It already scrolled correctly in isolation
            (offsetWidth 348, scrollWidth 720) and no descendant escaped the
            viewport, yet the whole PAGE still panned 214px sideways on a 390px
            screen — in the production build too, so not a dev-overlay
            artifact. Chrome was propagating this scroll container's overflow
            up to the document's scroll extent. Paint containment stops that,
            and it is a truthful description of the box: nothing inside it
            should affect layout outside it. Verified empirically against
            max-width, width, overflow-x:clip and flow-root, none of which
            helped. The revoke modal is a SIBLING of this div, not a
            descendant, so its position:fixed is unaffected. */}
        {loadState.status === "loaded" && loadState.items.length > 0 ? (
          <div className="contain-paint overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-paper/10 text-xs font-semibold uppercase tracking-[0.08em] text-paper-muted">
                <tr>
                  <th scope="col" className="px-5 py-3">Student &amp; Degree</th>
                  <th scope="col" className="px-5 py-3">Credential ID</th>
                  <th scope="col" className="px-5 py-3">Issued</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="px-5 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper/10">
                {loadState.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold text-paper">{item.studentName}</p>
                      <p className="text-paper-dim">{item.degree}</p>
                    </td>
                    {/* The credential id — the value that actually resolves at
                        /verify/<id>. This column previously rendered and copied
                        the issuance transaction id, so anyone who copied it (or
                        hand-typed what they saw) got a not-found page. Every
                        other control in this row already keys off item.id. */}
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-paper">
                          {truncateMiddle(item.id, 6)}
                        </span>
                        <CopyButton
                          text={item.id}
                          label="Copy"
                          className="min-h-8 px-2 py-1 text-xs"
                        />
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-paper-dim">
                      {formatDate(item.issuedAt)}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <StatusBadge
                        label={item.status === "ACTIVE" ? "Active" : "Revoked"}
                        tone={item.status === "ACTIVE" ? "solid" : "outline"}
                        icon={
                          item.status === "ACTIVE" ? (
                            <IconCheck className="h-full w-full" />
                          ) : (
                            <IconX className="h-full w-full" />
                          )
                        }
                      />
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="flex flex-col items-start gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/verify/${encodeURIComponent(item.id)}`}
                            className="text-sm font-semibold text-paper underline-offset-4 hover:underline"
                          >
                            View public page
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDownload(item)}
                            className="text-sm font-semibold text-paper-dim underline-offset-4 hover:underline"
                          >
                            Download certificate
                          </button>
                          {item.status === "ACTIVE" ? (
                            <button
                              ref={(node) => {
                                revokeTriggerRefs.current.set(item.id, node);
                              }}
                              type="button"
                              onClick={() => setRevokeTarget(item)}
                              className="text-sm font-semibold text-paper underline decoration-dotted underline-offset-4 hover:decoration-solid"
                            >
                              Revoke
                            </button>
                          ) : null}
                        </div>
                        {downloadError?.id === item.id ? (
                          <p role="alert" className="text-xs text-danger-400">
                            {downloadError.message}
                          </p>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {revokeTarget && wallet ? (
        <RevokeConfirmModal
          credential={revokeTarget}
          wallet={wallet}
          onCancel={() => setRevokeTarget(null)}
          onRevoked={applyRevoked}
          triggerRef={{ current: revokeTriggerRefs.current.get(revokeTarget.id) ?? null }}
        />
      ) : null}
    </section>
  );
}

function RegistrySkeleton() {
  return (
    <div className="space-y-3 p-5" role="status" aria-label="Loading credentials">
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-14 animate-pulse rounded-md bg-ink-800" />
      ))}
    </div>
  );
}
