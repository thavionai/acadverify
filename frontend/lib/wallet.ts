"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WalletConnection } from "@/lib/types";

/**
 * Minimal surface of `@midnight-ntwrk/dapp-connector-api` this app relies on.
 * Kept local (instead of importing the package) so the dashboard degrades
 * gracefully to "wallet unavailable" in environments where the package
 * isn't installed yet, per the stretch-goal status of wallet integration.
 */
type MidnightConnectorApi = {
  name?: string;
  rdns?: string;
  apiVersion?: string;
  isEnabled?: () => Promise<boolean>;
  enable: () => Promise<MidnightEnabledApi>;
};

type MidnightEnabledApi = {
  state: () => Promise<{ address: string }>;
};

declare global {
  interface Window {
    midnight?: Record<string, MidnightConnectorApi>;
  }
}

// Matched against both the object key on `window.midnight` and each
// provider's declared `name`/`rdns`, per the requirement to not rely on
// `window.midnight.mnLace` alone — other Midnight wallets announce
// themselves under different keys.
const WALLET_NAME_HINTS = ["lace", "midnight"];

function discoverWalletProviders(): Array<{
  key: string;
  provider: MidnightConnectorApi;
}> {
  if (typeof window === "undefined" || !window.midnight) return [];

  return Object.entries(window.midnight).filter(([key, provider]) => {
    const haystack = `${key} ${provider?.name ?? ""} ${
      provider?.rdns ?? ""
    }`.toLowerCase();
    return WALLET_NAME_HINTS.some((hint) => haystack.includes(hint));
  }).map(([key, provider]) => ({ key, provider }));
}

export type WalletState =
  | { status: "idle" }
  | { status: "unavailable" }
  | { status: "connecting" }
  | { status: "connected"; connection: WalletConnection }
  | { status: "error"; message: string };

const CONNECT_ERROR_FALLBACK =
  "The wallet extension did not respond. Approve the connection request in the extension, or try again.";

export function useMidnightWallet() {
  const [state, setState] = useState<WalletState>({ status: "idle" });
  const connectingRef = useRef(false);

  const connect = useCallback(async () => {
    if (connectingRef.current) return;

    const providers = discoverWalletProviders();

    if (providers.length === 0) {
      setState({ status: "unavailable" });
      return;
    }

    connectingRef.current = true;
    setState({ status: "connecting" });

    try {
      // Prefer an already-authorized provider if more than one extension is
      // installed, so re-opening the dashboard doesn't re-prompt.
      let authorized: { key: string; provider: MidnightConnectorApi } | null =
        null;

      for (const candidate of providers) {
        try {
          if (await candidate.provider.isEnabled?.()) {
            authorized = candidate;
            break;
          }
        } catch {
          // isEnabled is optional per the connector spec; ignore failures.
        }
      }

      const { key, provider } = authorized ?? providers[0];
      const api = await provider.enable();
      const walletState = await api.state();

      if (!walletState?.address) {
        throw new Error("The wallet did not return an address.");
      }

      setState({
        status: "connected",
        connection: {
          address: walletState.address,
          walletName: provider.name || key,
        },
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : CONNECT_ERROR_FALLBACK,
      });
    } finally {
      connectingRef.current = false;
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  // Detect wallets that inject after initial page load (common with
  // extensions) so the button doesn't wrongly report "unavailable" on a
  // cold load.
  useEffect(() => {
    if (state.status !== "idle") return;
    if (typeof window === "undefined") return;
    if (discoverWalletProviders().length > 0) return;

    const timer = window.setTimeout(() => {
      if (discoverWalletProviders().length > 0) {
        setState({ status: "idle" });
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [state.status]);

  // Restore an already-authorised wallet on mount.
  //
  // The connection lived in React state alone, so any full page load — a
  // refresh, a pasted /dashboard/registry link, a bookmark — dropped it and
  // re-gated the page behind "Connect your issuer wallet", even though the
  // extension was still authorised for this origin. A registrar who refreshed
  // mid-task was silently signed out.
  //
  // isEnabled() is the connector's own answer to "have I already been granted
  // access here?", and it does not prompt. It was already being called to
  // choose between providers during an explicit connect; this just asks it one
  // step earlier. Extensions inject asynchronously, so this retries briefly
  // rather than giving up on the first miss.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    let attempts = 0;

    async function restore() {
      if (cancelled || connectingRef.current) return;

      for (const { provider } of discoverWalletProviders()) {
        try {
          if (!(await provider.isEnabled?.())) continue;
          const api = await provider.enable();
          const walletState = await api.state();
          if (cancelled || !walletState?.address) continue;

          setState({
            status: "connected",
            connection: {
              address: walletState.address,
              walletName: provider.name || "Midnight wallet",
            },
          });
          return;
        } catch {
          // A wallet that refuses to restore is not an error worth showing:
          // the user can still connect explicitly.
        }
      }

      if (++attempts < 6 && !cancelled) window.setTimeout(restore, 300);
    }

    restore();
    return () => {
      cancelled = true;
    };
    // Mount only — an explicit disconnect must not immediately re-connect.
  }, []);

  return { state, connect, disconnect };
}
