// components/verify/VerifyResultCard.tsx
import type { VerifyResult } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { DisclosedWithheldPanel } from "./DisclosedWithheldpanel";
import { ProofDetails } from "./ProofDetails";

const SERVICE_ERROR_COPY: Record<
  Extract<VerifyResult, { kind: "service_error" }>["reason"],
  string
> = {
  not_found: "We couldn't find a credential with that ID. Double-check it and try again.",
  proof_unavailable:
    "Our proof service is temporarily unavailable. This is our infrastructure, not a problem with the credential — try again shortly.",
  chain_unavailable:
    "We couldn't reach the Midnight network right now. This is our infrastructure, not a problem with the credential — try again shortly.",
};

export function VerifyResultCard({ result, credentialId }: { result: VerifyResult; credentialId: string }) {
  switch (result.kind) {
    case "valid":
    case "revoked":
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <StatusBadge kind={result.kind} />
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Credential ID: <code className="break-all">{credentialId}</code>
            </span>
          </div>

          {result.kind === "revoked" && (
            <div className="border border-status-revoked-text/30 bg-status-revoked-bg rounded-lg p-4">
              <p className="font-body-sm text-body-sm text-status-revoked-text">
                This credential's proof still verifies, but the issuing institution has
                revoked it. Treat it as no longer valid.
              </p>
            </div>
          )}

          <DisclosedWithheldPanel disclosed={result.disclosed} withheld={result.withheld} />
          <ProofDetails proof={result.proof} />
        </div>
      );

    case "invalid_proof":
      return (
        <div className="space-y-4">
          <StatusBadge kind="invalid_proof" />
          <div className="border border-outline-variant rounded-lg bg-background-surface p-6">
            <p className="font-body-md text-body-md text-on-surface mb-2">
              The proof for this credential did not verify.
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              On Midnight, a credential with altered fields simply cannot produce a
              valid proof — there's nothing to compare against, so a failed proof
              means the underlying claim can't be substantiated as presented.
            </p>
          </div>
        </div>
      );

    case "service_error":
      return (
        <div className="space-y-4">
          <StatusBadge kind="service_error" />
          <div className="border border-outline-variant rounded-lg bg-background-surface p-6">
            <p className="font-body-md text-body-md text-on-surface mb-2">
              {SERVICE_ERROR_COPY[result.reason]}
            </p>
          </div>
        </div>
      );
  }
}