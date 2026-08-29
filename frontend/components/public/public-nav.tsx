"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWalletContext } from "@/lib/wallet-context";
import { WalletConnectButton } from "@/components/dashboard/wallet-connect-button";
import { IconBell, IconUserCircle } from "@/components/icons";

const NAV_LINKS = [
  { href: "/verify", label: "Verification" },
  { href: "/institutions", label: "Institutions" },
  { href: "/dashboard", label: "Universities" },
];

export function PublicNav() {
  const pathname = usePathname();
  const { walletState, connect, disconnect } = useWalletContext();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-950 text-xs font-bold text-white"
          >
            A
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-950">
            AcadVerify
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`border-b-2 pb-1 text-sm font-medium transition ${
                  isActive
                    ? "border-slate-950 text-slate-950"
                    : "border-transparent text-slate-600 hover:text-slate-950"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Notifications"
            className="hidden h-9 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 sm:flex"
          >
            <IconBell className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Account"
            className="hidden h-9 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 sm:flex"
          >
            <IconUserCircle className="h-5 w-5" />
          </button>
          <WalletConnectButton
            state={walletState}
            onConnect={connect}
            onDisconnect={disconnect}
            showNetworkBadge={false}
          />
        </div>
      </div>
    </header>
  );
}
