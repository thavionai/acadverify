"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWalletContext } from "@/lib/wallet-context";
import { WalletConnectButton } from "@/components/dashboard/wallet-connect-button";

const NAV_LINKS = [
  { href: "/verify", label: "Verification" },
  { href: "/institutions", label: "Institutions" },
  { href: "/dashboard", label: "Universities" },
];

/**
 * These variants were once called `light` and `dark`, from when every page but
 * the landing page had a white header. The whole application is dark now, so
 * that naming described nothing. The only real difference left is whether the
 * header sits in its own band or floats over artwork.
 *
 *   surface  every interior page: a solid bar with a rule under it
 *   hero     the landing page: transparent, floating over the tree
 */
type Variant = "surface" | "hero";

const HEADER: Record<Variant, string> = {
  surface: "border-b border-paper/10 bg-ink-950",
  hero: "absolute inset-x-0 top-0 z-20 bg-transparent",
};

export function PublicNav({ variant = "surface" }: { variant?: Variant } = {}) {
  const pathname = usePathname();
  const { walletState, connect, disconnect } = useWalletContext();

  return (
    <header className={HEADER[variant]}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-gold-500 text-xs font-bold text-ink-950"
          >
            A
          </span>
          <span className="text-lg font-semibold tracking-tight text-paper">
            AcadVerify
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive =
              pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`border-b-2 pb-1 text-sm font-medium transition ${
                  isActive
                    ? "border-gold-500 text-paper"
                    : "border-transparent text-paper-dim hover:text-gold-300"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* A Notifications bell and an Account avatar used to sit here. Neither
            had a handler or a destination — chrome that looked operable and
            did nothing. Removed rather than restyled. */}
        <WalletConnectButton
          state={walletState}
          onConnect={connect}
          onDisconnect={disconnect}
          showNetworkBadge={false}
        />
      </div>
    </header>
  );
}
