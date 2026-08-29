// components/verify/ProofLoadingState.tsx
"use client";

import { useEffect, useState } from "react";

// The verify endpoint generates a ZK proof server-side and is CPU-bound
// (api-spec.md: "not a sub-100ms lookup"). A bare spinner past a few seconds
// reads as a hang. This rotates reassuring, honest copy instead of pretending
// to show real progress we don't have visibility into.
const MESSAGES = [
  "Generating a zero-knowledge proof…",
  "This confirms the credential without revealing withheld fields…",
  "Still working — proof generation can take a moment…",
];

export function ProofLoadingState() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMessageIndex((i) => Math.min(i + 1, MESSAGES.length - 1));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-4 border border-outline-variant rounded-lg bg-background-surface p-12 text-center"
    >
      <span
        className="material-symbols-outlined spin text-primary"
        style={{ fontSize: 32 }}
        aria-hidden="true"
      >
        autorenew
      </span>
      <p className="font-label-md text-label-md text-on-surface">{MESSAGES[messageIndex]}</p>
      <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm">
        This isn't a rejection — it just takes real computation to verify a
        credential without seeing everything in it.
      </p>
    </div>
  );
}