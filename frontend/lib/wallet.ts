"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WalletConnection } from "@/lib/types";

/**
 * Midnight DApp connector, as the Lace extension actually implements it
 * (apiVersion 4.0.1, verified against a live wallet).
 *
 * This file previously described a different API entirely — `window.midnight.mnLace`
 * with `isEnabled()` and `enable()` returning `{ state(): {address} }`. None of
 * those exist. Connecting a real wallet failed with "provider.enable is not a
 * function", and the bug survived because the only thing ever tested against
 * was a stub built from these same wrong assumptions.
 *
 * What the extension really exposes:
 *
 *   window.midnight[<uuid>]              // the key is a random UUID, not a name
 *     .name / .rdns / .icon / .apiVersion
 *     .connect(networkId) -> api         // NOT enable(); the network is required
 *
 *   api.getShieldedAddresses()   -> { shieldedAddress: "mn_shield-addr1..." }
 *   api.getUnshieldedAddress()   -> { unshieldedAddress: "mn_addr1..." }
 *   api.getConfiguration()       -> { networkId, indexerUri, proverServerUri, ... }
 *   api.getConnectionStatus()    -> current authorisation state
 *
 * Because the key is a UUID, discovery can only match on `name`/`rdns`.
 */
type MidnightConnectorApi = {
  name?: string;
  rdns?: string;
  icon?: string;
  apiVersion?: string;
  connect: (networkId: string) => Promise<MidnightWalletApi>;
};

type MidnightWalletApi = {
  getShieldedAddresses?: () => Promise<{ shieldedAddress?: string } | string[]>;
  getUnshieldedAddress?: () => Promise<{ unshieldedAddress?: string } | string>;
  getConfiguration?: () => Promise<{ networkId?: string }>;
  getConnectionStatus?: () => Promise<unknown>;
};

declare global {
  interface Window {
    midnight?: Record<string, MidnightConnectorApi>;
  }
}

const WALLET_NAME_HINTS = ["lace", "midnight"];

/**
 * Networks to offer the wallet, best guess first.
 *
 * `connect()` rejects with "Network ID mismatch" unless the id matches the
 * network the wallet is actually on, and the wallet gives no way to ask
 * before connecting — so this tries the network this build targets, then the
 * rest of the valid set. Order matters only for how many rejections we walk
 * through before succeeding.
 */
const APP_NETWORK = process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID || "undeployed";
const CANDIDATE_NETWORKS = [
  APP_NETWORK,
  "undeployed",
  "devnet",
  "preview",
  "preprod",
  "testnet",
  "qanet",
  "mainnet",
].filter((n, i, all) => all.indexOf(n) === i);

function discoverWalletProviders(): Array<{
  key: string;
  provider: MidnightConnectorApi;
}> {
  if (typeof window === "undefined" || !window.midnight) return [];

  return Object.entries(window.midnight)
    .filter(([key, provider]) => {
      // The key is a UUID in current Lace, so `name`/`rdns` do the real work
      // here; `key` is kept in the haystack for wallets that still use a name.
      const haystack = `${key} ${provider?.name ?? ""} ${
        provider?.rdns ?? ""
      }`.toLowerCase();
      return (
        typeof provider?.connect === "function" &&
        WALLET_NAME_HINTS.some((hint) => haystack.includes(hint))
      );
    })
    .map(([key, provider]) => ({ key, provider }));
}

/** Both address getters return a wrapper object; tolerate a bare string too. */
async function readAddress(api: MidnightWalletApi): Promise<string | null> {
  try {
    const shielded = await api.getShieldedAddresses?.();
    if (typeof shielded === "string") return shielded;
    if (Array.isArray(shielded)) return shielded[0] ?? null;
    if (shielded?.shieldedAddress) return shielded.shieldedAddress;
  } catch {
    // fall through to the unshielded address
  }

  try {
    const unshielded = await api.getUnshieldedAddress?.();
    if (typeof unshielded === "string") return unshielded;
    if (unshielded && typeof unshielded === "object" && unshielded.unshieldedAddress) {
      return unshielded.unshieldedAddress;
    }
  } catch {
    // no address available
  }

  return null;
}

/** Try each candidate network until the wallet accepts one. */
async function connectOnAnyNetwork(provider: MidnightConnectorApi): Promise<{
  api: MidnightWalletApi;
  networkId: string;
} | null> {
  for (const networkId of CANDIDATE_NETWORKS) {
    try {
      const api = await provider.connect(networkId);
      if (api) return { api, networkId };
    } catch {
      // "Network ID mismatch" simply means the wallet is on a different
      // network; try the next one rather than surfacing it as a failure.
    }
  }
  return null;
}

export type WalletState =
  | { status: "idle" }
  | { status: "unavailable" }
  | { status: "connecting" }
  | { status: "connected"; connection: WalletConnection }
  | { status: "error"; message: string };

const LAST_NETWORK_KEY = "acadverify.wallet.networkId";

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
      let connected: {
        provider: MidnightConnectorApi;
        api: MidnightWalletApi;
        networkId: string;
      } | null = null;

      for (const { provider } of providers) {
        const result = await connectOnAnyNetwork(provider);
        if (result) {
          connected = { provider, ...result };
          break;
        }
      }

      if (!connected) {
        throw new Error(
          "No wallet accepted a connection. Check that the wallet is unlocked.",
        );
      }

      const address = await readAddress(connected.api);
      if (!address) throw new Error("The wallet did not return an address.");

      window.localStorage.setItem(LAST_NETWORK_KEY, connected.networkId);

      setState({
        status: "connected",
        connection: {
          address,
          walletName: connected.provider.name || "Midnight wallet",
          networkId: connected.networkId,
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

  // Restore an already-authorised wallet on mount.
  //
  // Without this the connection lives in React state alone, so any full page
  // load — a refresh, a pasted /dashboard/registry link, a bookmark — drops it
  // and re-gates the page behind "Connect your issuer wallet" even though the
  // extension is still authorised for this origin.
  //
  // Only the network that worked last time is retried, read from
  // localStorage. Walking all eight candidates on every mount would be slow
  // and could prompt; reconnecting on the known-good one returns silently
  // while the DApp authorisation still stands.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const remembered = window.localStorage.getItem(LAST_NETWORK_KEY);
    if (!remembered) return;

    let cancelled = false;
    let attempts = 0;

    async function restore() {
      if (cancelled || connectingRef.current) return;

      for (const { provider } of discoverWalletProviders()) {
        try {
          const api = await provider.connect(remembered as string);
          const address = await readAddress(api);
          if (cancelled || !address) continue;

          setState({
            status: "connected",
            connection: {
              address,
              walletName: provider.name || "Midnight wallet",
              networkId: remembered as string,
            },
          });
          return;
        } catch {
          // Authorisation revoked, wallet locked, or the network changed. The
          // user can still connect explicitly; not worth surfacing an error.
        }
      }

      if (++attempts < 6 && !cancelled) window.setTimeout(restore, 300);
    }

    restore();
    return () => {
      cancelled = true;
    };
    // Mount only — an explicit disconnect must not immediately reconnect.
  }, []);

  // Extensions inject asynchronously, so a cold load can miss them. Re-check
  // briefly rather than reporting "unavailable" too early.
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

  return { state, connect, disconnect };
}
