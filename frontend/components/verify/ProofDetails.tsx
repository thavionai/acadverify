// components/verify/ProofDetails.tsx
"use client";

import { useState } from "react";
import type { ProofDetails as ProofDetailsType } from "@/lib/types";

const INDEXER_ENDPOINT = "https://indexer.preview.midnight.network/api/v4/graphql";

export function ProofDetails({ proof }: { proof: ProofDetailsType }) {
  const [copied, setCopied] = useState(false);
  const query = `query { contractAction(address: "${proof.contractAddress}") { __typename } }`;

  async function copyQuery() {
    await navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="border border-outline-variant rounded-lg bg-background-surface p-5">
      <h3 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide mb-3">
        Proof details
      </h3>

      <dl className="space-y-2 mb-4">
        <Row label="Network" value={proof.networkId} />
        <Row label="Contract address" value={proof.contractAddress} mono />
        <Row label="Transaction ID" value={proof.txId} mono />
        <Row label="Proved at" value={new Date(proof.provedAt).toLocaleString()} />
      </dl>

      {/* No explorer link — there is no PolygonScan for Midnight. Instead:
          a copyable indexer query anyone can run themselves, per api-spec.md
          "On show me the transaction". */}
      <div className="bg-background-muted border border-outline-variant rounded p-3">
        <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
          Verify this independently — run this query yourself, no need to trust us:
        </p>
        <div className="flex items-start gap-2">
          <code className="flex-1 font-body-sm text-body-sm text-on-surface break-all bg-background-surface p-2 rounded border border-outline-variant">
            {query}
          </code>
          <button
            onClick={copyQuery}
            type="button"
            className="shrink-0 flex items-center gap-1 border border-outline-variant px-3 py-2 rounded font-label-sm text-label-sm text-primary hover:bg-background-muted transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
              {copied ? "check" : "content_copy"}
            </span>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
          Endpoint: <code className="break-all">{INDEXER_ENDPOINT}</code>
        </p>
      </div>
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-body-sm text-body-sm text-on-surface-variant shrink-0">{label}</dt>
      <dd
        className={`font-label-md text-label-md text-on-surface text-right break-all ${mono ? "font-mono text-body-sm" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}