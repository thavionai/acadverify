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
      className={`inline-flex min-h-9 items-center justify-center rounded-md border border-paper/20 bg-ink-900 px-3 py-1.5 text-sm font-semibold text-paper transition hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 ${className}`}
      aria-live="polite"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
