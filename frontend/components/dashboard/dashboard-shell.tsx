"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useWalletContext } from "@/lib/wallet-context";
import { WalletConnectButton } from "@/components/dashboard/wallet-connect-button";
import { InstitutionStatusBanner } from "@/components/dashboard/institution-status-banner";
import {
  IconDatabase,
  IconGraduationCap,
  IconGrid,
  IconHelpCircle,
  IconPlus,
  IconSettings,
  IconShieldCheck,
} from "@/components/icons";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: IconGrid, exact: true },
  { href: "/dashboard/issue", label: "Issue Credentials", icon: IconGraduationCap },
  { href: "/dashboard/registry", label: "Registry", icon: IconDatabase },
  { href: "/dashboard/verification", label: "Verification", icon: IconShieldCheck },
  { href: "/dashboard/settings", label: "Settings", icon: IconSettings },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { walletState, connect, disconnect } = useWalletContext();

  return (
    <div className="flex min-h-screen bg-white">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 px-5 py-6">
        <div>
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-950">
            AcadVerify
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">Academic Registry</p>
        </div>

        <nav aria-label="Dashboard" className="mt-8 flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname?.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "border-l-2 border-slate-950 bg-slate-100 text-slate-950"
                    : "border-l-2 border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-slate-200 pt-4">
          <Link
            href="/dashboard/issue"
            className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
          >
            <IconPlus className="h-4 w-4" aria-hidden />
            Issue New Certificate
          </Link>
          <a
            href="mailto:support@acadverify.example"
            className="flex items-center gap-2 px-3 text-sm text-slate-600 hover:text-slate-950"
          >
            <IconHelpCircle className="h-4 w-4" aria-hidden />
            Support
          </a>
          <Link
            href="/dashboard/settings#security"
            className="flex items-center gap-2 px-3 text-sm text-slate-600 hover:text-slate-950"
          >
            <IconShieldCheck className="h-4 w-4" aria-hidden />
            Security
          </Link>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-end border-b border-slate-200 px-6 py-4">
          <WalletConnectButton state={walletState} onConnect={connect} onDisconnect={disconnect} />
        </header>
        <main className="px-6 py-8 sm:px-8">
          <InstitutionStatusBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
