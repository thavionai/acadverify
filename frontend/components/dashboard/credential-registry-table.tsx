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
    }).then((result) => {
      if (result.ok) {
        setLoadState({ status: "loaded", items: result.data.items });
      } else {
        setLoadState({ status: "error", message: result.error.message });
      }
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
      <section className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-950">
          Connect your issuer wallet
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          The registry is scoped to credentials issued by your institution's
          wallet, so it's hidden until you connect.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-950">Issued Credential Registry</h1>
      <p className="mt-1 text-sm text-slate-600">
        Search, download certificates, or revoke credentials your institution
        has issued.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <label htmlFor="registry-search" className="sr-only">
              Search credentials
            </label>
            <input
              id="registry-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by student name, ID, or degree"
              className="min-h-11 w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
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
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>
        </div>

        {loadState.status === "loading" ? <RegistrySkeleton /> : null}

        {loadState.status === "error" ? (
          <p role="alert" className="p-6 text-sm text-slate-700">
            {loadState.message}
          </p>
        ) : null}

        {loadState.status === "loaded" && loadState.items.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">No credentials match your search.</p>
        ) : null}

        {loadState.status === "loaded" && loadState.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
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
              <tbody className="divide-y divide-slate-100">
                {loadState.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold text-slate-950">{item.studentName}</p>
                      <p className="text-slate-600">{item.degree}</p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-800">
                          {truncateMiddle(item.commitmentHash, 6)}
                        </span>
                        <CopyButton
                          text={item.commitmentHash}
                          label="Copy"
                          className="min-h-8 px-2 py-1 text-xs"
                        />
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-slate-700">
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
                            className="text-sm font-semibold text-slate-950 underline-offset-4 hover:underline"
                          >
                            View public page
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDownload(item)}
                            className="text-sm font-semibold text-slate-700 underline-offset-4 hover:underline"
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
                              className="text-sm font-semibold text-slate-950 underline decoration-dotted underline-offset-4 hover:decoration-solid"
                            >
                              Revoke
                            </button>
                          ) : null}
                        </div>
                        {downloadError?.id === item.id ? (
                          <p role="alert" className="text-xs text-slate-600">
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
        <div key={row} className="h-14 animate-pulse rounded-md bg-slate-100" />
      ))}
    </div>
  );
}
