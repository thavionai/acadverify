"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className = "",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be blocked (permissions, insecure context).
      // Fail silently rather than throwing in front of the user; the value
      // remains visible and selectable on screen either way.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 ${className}`}
      aria-live="polite"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
