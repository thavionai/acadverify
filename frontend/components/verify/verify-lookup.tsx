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
      <main className="bg-slate-50 px-5 pb-20 pt-16 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Verify a Credential
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Confirm the authenticity of an academic record instantly against
            the Midnight ledger.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <form onSubmit={submitCredential} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="credentialId" className="sr-only">
              Credential ID or share link
            </label>
            <div className="relative flex-1">
              <IconSearch
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              />
              <input
                id="credentialId"
                value={credentialId}
                onChange={(event) => setCredentialId(event.target.value)}
                autoComplete="off"
                placeholder="Enter Credential ID or share link"
                className="min-h-12 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
              />
            </div>
            <button
              type="submit"
              disabled={!credentialId.trim()}
              className="inline-flex min-h-12 items-center justify-center rounded-md bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Verify
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Or
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {!scannerActive && cameraState !== "unsupported" ? (
            <button
              type="button"
              onClick={startScanner}
              className="mx-auto flex min-h-12 items-center justify-center gap-2 rounded-md border border-slate-950 px-6 text-sm font-semibold text-slate-950 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
            >
              <IconQrCode className="h-5 w-5" aria-hidden />
              Scan QR Code
            </button>
          ) : null}

          {scannerActive || cameraState === "error" || cameraState === "unsupported" ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">QR scanner</p>
                {scannerActive ? (
                  <button
                    type="button"
                    onClick={stopScanner}
                    className="text-sm font-semibold text-slate-950 underline-offset-4 hover:underline"
                  >
                    Stop
                  </button>
                ) : null}
              </div>
              <div className="aspect-video overflow-hidden rounded-md border border-slate-200 bg-slate-950">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              </div>
              {cameraMessage ? (
                <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700" role="status">
                  {cameraMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mx-auto mt-4 max-w-xl text-center text-xs text-slate-500">
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
