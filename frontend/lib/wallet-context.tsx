"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getInstitutionProfile } from "@/lib/api";
import { useMidnightWallet, type WalletState } from "@/lib/wallet";
import type { InstitutionProfile, WalletConnection } from "@/lib/types";

export type InstitutionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; profile: InstitutionProfile }
  | { status: "error"; message: string };

type WalletContextValue = {
  walletState: WalletState;
  wallet: WalletConnection | null;
  connect: () => void;
  disconnect: () => void;
  institution: InstitutionState;
  refreshInstitution: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const NOT_REGISTERED_PROFILE: InstitutionProfile = {
  name: "",
  website: "",
  contactEmail: "",
  country: "",
  status: "NOT_REGISTERED",
};

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const { state, connect, disconnect } = useMidnightWallet();
  const [institution, setInstitution] = useState<InstitutionState>({ status: "idle" });

  const wallet = state.status === "connected" ? state.connection : null;

  const loadInstitution = useCallback(
    (connection: WalletConnection, signal?: AbortSignal) => {
      setInstitution({ status: "loading" });

      getInstitutionProfile(connection, { signal }).then((result) => {
        if (signal?.aborted) return;

        if (result.ok) {
          setInstitution({ status: "loaded", profile: result.data });
        } else if (result.error.code === "NOT_FOUND") {
          // No institution registered under this wallet yet — that's a
          // normal, expected state, not an error.
          setInstitution({ status: "loaded", profile: NOT_REGISTERED_PROFILE });
        } else {
          setInstitution({ status: "error", message: result.error.message });
        }
      });
    },
    [],
  );

  useEffect(() => {
    if (!wallet) {
      setInstitution({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    loadInstitution(wallet, controller.signal);
    return () => controller.abort();
  }, [wallet, loadInstitution]);

  const refreshInstitution = useCallback(() => {
    if (wallet) loadInstitution(wallet);
  }, [wallet, loadInstitution]);

  return (
    <WalletContext.Provider
      value={{
        walletState: state,
        wallet,
        connect,
        disconnect,
        institution,
        refreshInstitution,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWalletContext must be used within a WalletContextProvider");
  }
  return context;
}
