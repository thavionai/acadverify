import type { ReactNode } from "react";

/**
 * Verification outcome badge.
 *
 * Shape carries the meaning on its own — solid / outline / dashed / dotted —
 * so the four states stay distinguishable to a colourblind reader and in a
 * greyscale printout of a certificate. Colour is added on top as reinforcement,
 * never as the only signal.
 *
 * The colour assignment is not decorative:
 *
 *   solid   gold    VALID — authentic, sealed. Gold is the brand's mark of
 *                   authenticity, and a filled badge is the heaviest thing on
 *                   the page, which is right for the answer people came for.
 *   outline red     REVOKED — real, but withdrawn by its issuer.
 *   dashed  red     INVALID_PROOF — no proof could be produced for this.
 *   dotted  neutral OUR failure, not the credential's. Deliberately not red:
 *                   a wiped vault or an unreachable node must never look like
 *                   a forged degree.
 */
const TONE_CLASSES = {
  solid: "border-gold-500 bg-gold-500 text-ink-950",
  outline: "border-danger-500 bg-danger-500/10 text-danger-400",
  dashed: "border-dashed border-danger-500 bg-danger-500/5 text-danger-400",
  dotted: "border-dotted border-paper/30 bg-ink-800 text-paper-muted",
} as const;

export function StatusBadge({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: keyof typeof TONE_CLASSES;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.06em] ${TONE_CLASSES[tone]}`}
    >
      {icon ? (
        <span aria-hidden className="h-3.5 w-3.5">
          {icon}
        </span>
      ) : null}
      {label}
    </span>
  );
}
