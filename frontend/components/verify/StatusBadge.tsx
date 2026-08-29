import type { VerifyResult } from "@/lib/types";

type StatusKind = VerifyResult["kind"];

const STATUS_CONFIG: Record<
  StatusKind,
  { label: string; bg: string; text: string; icon: string }
> = {
  valid: {
    label: "Valid credential",
    bg: "bg-status-valid-bg",
    text: "text-status-valid-text",
    icon: "check_circle",
  },
  revoked: {
    label: "Revoked",
    bg: "bg-status-revoked-bg",
    text: "text-status-revoked-text",
    icon: "block",
  },
  invalid_proof: {
    label: "Proof did not verify",
    bg: "bg-status-warning-bg",
    text: "text-status-warning-text",
    icon: "gpp_maybe",
  },
  service_error: {
    label: "Couldn't check right now",
    bg: "bg-status-neutral-bg",
    text: "text-status-neutral-text",
    icon: "cloud_off",
  },
};

// Never rely on color alone — every badge pairs an icon + text label so the
// 4 states stay distinguishable for colorblind users (WCAG AA requirement
// from frontend-engineer.md's definition of done).
export function StatusBadge({ kind }: { kind: StatusKind }) {
  const cfg = STATUS_CONFIG[kind];
  return (
    <div
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant ${cfg.bg} ${cfg.text}`}
      role="status"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
        {cfg.icon}
      </span>
      <span className="font-label-md text-label-md">{cfg.label}</span>
    </div>
  );
}