"use client";

import { truncateMiddle } from "@/lib/format";
import type { WalletState } from "@/lib/wallet";

const NETWORK_LABEL =
  process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK || "Midnight Testnet";

export function WalletConnectButton({
  state,
  onConnect,
  onDisconnect,
  showNetworkBadge = true,
}: {
  state: WalletState;
  onConnect: () => void;
  onDisconnect: () => void;
  showNetworkBadge?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showNetworkBadge ? (
        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-slate-950" />
          {NETWORK_LABEL}
        </span>
      ) : null}

      {state.status === "connected" ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950">
            {state.connection.walletName}
            <span className="font-mono text-slate-500">
              {truncateMiddle(state.connection.address, 5)}
            </span>
          </span>
          <button
            type="button"
            onClick={onDisconnect}
            className="text-sm font-semibold text-slate-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
          >
            Disconnect
          </button>
        </div>
      ) : null}

      {state.status === "idle" ? (
        <button
          type="button"
          onClick={onConnect}
          className="inline-flex min-h-9 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
        >
          Connect Wallet
        </button>
      ) : null}

      {state.status === "connecting" ? (
        <button
          type="button"
          disabled
          className="inline-flex min-h-9 cursor-not-allowed items-center justify-center rounded-md bg-slate-400 px-4 text-sm font-semibold text-white"
        >
          Connecting&hellip;
        </button>
      ) : null}

      {state.status === "unavailable" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>No Midnight wallet detected.</span>
          <a
            href="https://docs.midnight.network/develop/tutorial/using/lace-wallet"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-slate-950 underline-offset-4 hover:underline"
          >
            Install Lace
          </a>
          <button
            type="button"
            onClick={onConnect}
            className="font-semibold text-slate-950 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
          >
            Retry
          </button>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-700">{state.message}</span>
          <button
            type="button"
            onClick={onConnect}
            className="font-semibold text-slate-950 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
