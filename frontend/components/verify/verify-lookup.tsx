"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { PublicNav } from "@/components/public/public-nav";
import { IconQrCode, IconSearch } from "@/components/icons";

type DetectedBarcode = {
  rawValue: string;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

export function VerifyLookup() {
  const router = useRouter();
  const [credentialId, setCredentialId] = useState("");
  const [cameraState, setCameraState] = useState<
    "idle" | "starting" | "scanning" | "unsupported" | "error"
  >("idle");
  const [cameraMessage, setCameraMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = credentialId.trim();

    if (normalized) {
      router.push(`/verify/${encodeURIComponent(normalized)}`);
    }
  }

  async function startScanner() {
    if (!window.BarcodeDetector) {
      setCameraState("unsupported");
      setCameraMessage("This browser does not support in-page QR scanning.");
      return;
    }

    setCameraState("starting");
    setCameraMessage("Starting camera.");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraState("scanning");
      setCameraMessage("Point the camera at a credential QR code.");
    } catch {
      setCameraState("error");
      setCameraMessage(
        "Camera access was not available. Enter the credential ID instead.",
      );
    }
  }

  function stopScanner() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraState("idle");
    setCameraMessage("");
  }

  useEffect(() => {
    if (cameraState !== "scanning" || !window.BarcodeDetector) return;

    let cancelled = false;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

    async function scanFrame() {
      if (cancelled || !videoRef.current) return;

      try {
        const barcodes = await detector.detect(videoRef.current);
        const rawValue = barcodes[0]?.rawValue;

        if (rawValue) {
          const id = extractCredentialId(rawValue);
          stopScanner();
          router.push(`/verify/${encodeURIComponent(id)}`);
          return;
        }
      } catch {
        setCameraMessage("QR scanning paused. Keep the code centered.");
      }

      window.setTimeout(scanFrame, 650);
    }

    scanFrame();

    return () => {
      cancelled = true;
    };
  }, [cameraState, router]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const scannerActive = cameraState === "scanning" || cameraState === "starting";

  return (
    <>
      <PublicNav />
      <main className="flex-1 bg-ink-950 px-5 pb-20 pt-16 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-paper sm:text-5xl">
            Verify a Credential
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-paper-dim">
            Confirm the authenticity of an academic record instantly against
            the Midnight ledger.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-xl rounded-lg border border-paper/10 bg-ink-900 p-6 shadow-sm sm:p-8">
          <form onSubmit={submitCredential} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="credentialId" className="sr-only">
              Credential ID or share link
            </label>
            <div className="relative flex-1">
              <IconSearch
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-paper-muted"
              />
              <input
                id="credentialId"
                value={credentialId}
                onChange={(event) => setCredentialId(event.target.value)}
                autoComplete="off"
                placeholder="Enter Credential ID or share link"
                className="min-h-12 w-full rounded-md border border-paper/20 bg-ink-800 pl-10 pr-3 text-base text-paper outline-none transition placeholder:text-paper-muted focus:border-gold-500 focus:ring-2 focus:ring-gold-500/10"
              />
            </div>
            <button
              type="submit"
              disabled={!credentialId.trim()}
              className="inline-flex min-h-12 items-center justify-center rounded-md bg-gold-500 px-6 text-sm font-semibold text-ink-950 transition hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-paper-muted"
            >
              Verify
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-paper/15" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-paper-muted">
              Or
            </span>
            <div className="h-px flex-1 bg-paper/15" />
          </div>

          {!scannerActive && cameraState !== "unsupported" ? (
            <button
              type="button"
              onClick={startScanner}
              className="mx-auto flex min-h-12 items-center justify-center gap-2 rounded-md border border-gold-500 px-6 text-sm font-semibold text-paper transition hover:bg-ink-850 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
            >
              <IconQrCode className="h-5 w-5" aria-hidden />
              Scan QR Code
            </button>
          ) : null}

          {scannerActive || cameraState === "error" || cameraState === "unsupported" ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-paper">QR scanner</p>
                {scannerActive ? (
                  <button
                    type="button"
                    onClick={stopScanner}
                    className="text-sm font-semibold text-paper underline-offset-4 hover:underline"
                  >
                    Stop
                  </button>
                ) : null}
              </div>
              <div className="aspect-video overflow-hidden rounded-md border border-paper/10 bg-gold-500">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              </div>
              {cameraMessage ? (
                <p className="rounded-md bg-ink-800 px-3 py-2 text-sm text-paper-dim" role="status">
                  {cameraMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mx-auto mt-4 max-w-xl text-center text-xs text-paper-muted">
          Proof generation is not instant — the result screen shows real
          progress rather than a spinner that could read as a hang.
        </div>
      </main>
    </>
  );
}

function extractCredentialId(rawValue: string) {
  try {
    const url = new URL(rawValue);
    const segments = url.pathname.split("/").filter(Boolean);
    const verifyIndex = segments.findIndex((segment) => segment === "verify");

    if (verifyIndex >= 0 && segments[verifyIndex + 1]) {
      return decodeURIComponent(segments[verifyIndex + 1]);
    }
  } catch {
    return rawValue.trim();
  }

  return rawValue.trim();
}
