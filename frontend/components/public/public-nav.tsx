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

/**
 * `dark` is for the landing page, which sits on the black/gold artwork; the
 * header floats over the hero rather than sitting in its own band. Every other
 * public page uses `light`.
 */
type Variant = "light" | "dark";

const STYLES: Record<
  Variant,
  {
    header: string;
    mark: string;
    wordmark: string;
    linkActive: string;
    linkIdle: string;
    iconButton: string;
  }
> = {
  light: {
    header: "border-b border-slate-200 bg-white",
    mark: "bg-slate-950 text-white",
    wordmark: "text-slate-950",
    linkActive: "border-slate-950 text-slate-950",
    linkIdle: "border-transparent text-slate-600 hover:text-slate-950",
    iconButton: "text-slate-500 hover:bg-slate-100 hover:text-slate-950",
  },
  dark: {
    header: "absolute inset-x-0 top-0 z-20 bg-transparent",
    mark: "bg-gold-500 text-ink-950",
    wordmark: "text-paper",
    linkActive: "border-gold-500 text-paper",
    linkIdle: "border-transparent text-paper-dim hover:text-gold-300",
    iconButton: "text-paper-muted hover:bg-paper/10 hover:text-paper",
  },
};

export function PublicNav({ variant = "light" }: { variant?: Variant } = {}) {
  const pathname = usePathname();
  const { walletState, connect, disconnect } = useWalletContext();
  const s = STYLES[variant];

  return (
    <header className={s.header}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${s.mark}`}
          >
            A
          </span>
          <span className={`text-lg font-semibold tracking-tight ${s.wordmark}`}>
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
                  isActive ? s.linkActive : s.linkIdle
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {/* These two are presentational only — they have no handlers and no
              destination. Kept on the product pages where the chrome is
              expected, omitted from the landing page rather than offering a
              visitor a control that does nothing. */}
          {variant === "light" ? (
            <>
              <button
                type="button"
                aria-label="Notifications"
                className={`hidden h-9 w-9 items-center justify-center rounded-md transition sm:flex ${s.iconButton}`}
              >
                <IconBell className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Account"
                className={`hidden h-9 w-9 items-center justify-center rounded-md transition sm:flex ${s.iconButton}`}
              >
                <IconUserCircle className="h-5 w-5" />
              </button>
            </>
          ) : null}
          <WalletConnectButton
            state={walletState}
            onConnect={connect}
            onDisconnect={disconnect}
            showNetworkBadge={false}
            tone={variant}
          />
        </div>
      </div>
    </header>
  );
}
