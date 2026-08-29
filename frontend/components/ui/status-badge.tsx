import type { ReactNode } from "react";

const TONE_CLASSES = {
  solid: "border-slate-950 bg-slate-950 text-white",
  outline: "border-slate-950 bg-white text-slate-950",
  dashed: "border-dashed border-slate-950 bg-white text-slate-950",
  dotted: "border-dotted border-slate-400 bg-white text-slate-500",
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
