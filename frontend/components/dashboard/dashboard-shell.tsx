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
    <div className="flex min-h-screen flex-1 flex-col bg-ink-950 lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-paper/10 px-5 py-4 lg:w-64 lg:border-b-0 lg:border-r lg:py-6">
        <div>
          <Link href="/" className="text-lg font-semibold tracking-tight text-paper">
            AcadVerify
          </Link>
          <p className="mt-0.5 text-xs text-paper-muted">Academic Registry</p>
        </div>

        {/* Horizontal and scrollable on small screens, vertical from lg. */}
        <nav
          aria-label="Dashboard"
          className="mt-4 flex flex-1 gap-1 overflow-x-auto lg:mt-8 lg:flex-col lg:space-y-1 lg:overflow-visible"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname?.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "border-l-2 border-gold-500 bg-ink-800 text-paper"
                    : "border-l-2 border-transparent text-paper-dim hover:bg-ink-850 hover:text-paper"
                }`}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-paper/10 pt-4 lg:mt-0 lg:block lg:space-y-3">
          <Link
            href="/dashboard/issue"
            className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-gold-500 px-4 text-sm font-semibold text-ink-950 transition hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
          >
            <IconPlus className="h-4 w-4" aria-hidden />
            Issue New Certificate
          </Link>
          <a
            href="mailto:support@acadverify.example"
            className="flex items-center gap-2 px-3 text-sm text-paper-dim hover:text-paper"
          >
            <IconHelpCircle className="h-4 w-4" aria-hidden />
            Support
          </a>
          <Link
            href="/dashboard/settings#security"
            className="flex items-center gap-2 px-3 text-sm text-paper-dim hover:text-paper"
          >
            <IconShieldCheck className="h-4 w-4" aria-hidden />
            Security
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-end border-b border-paper/10 px-5 py-4 sm:px-6">
          <WalletConnectButton state={walletState} onConnect={connect} onDisconnect={disconnect} />
        </header>
        <main className="px-5 py-8 sm:px-6 lg:px-8">
          <InstitutionStatusBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
