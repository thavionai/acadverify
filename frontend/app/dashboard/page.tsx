"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listCredentials } from "@/lib/api";
import { useWalletContext } from "@/lib/wallet-context";
import { IconDatabase, IconGraduationCap, IconShieldCheck } from "@/components/icons";

type Counts = { total: number; active: number; revoked: number };

export default function DashboardPage() {
  const { wallet, institution } = useWalletContext();
  const [counts, setCounts] = useState<Counts | null>(null);

  const isAuthorized =
    institution.status === "loaded" && institution.profile.status === "AUTHORIZED";

  useEffect(() => {
    if (!wallet || !isAuthorized) return;

    const controller = new AbortController();
    listCredentials(wallet, { signal: controller.signal }).then((result) => {
      if (!result.ok) return;
      const active = result.data.items.filter((item) => item.status === "ACTIVE").length;
      setCounts({
        total: result.data.total,
        active,
        revoked: result.data.total - active,
      });
    });

    return () => controller.abort();
  }, [wallet, isAuthorized]);

  if (!wallet) {
    return (
      <section className="rounded-lg border border-paper/10 bg-ink-900 p-8 text-center">
        <h1 className="text-xl font-semibold text-paper">
          Connect your issuer wallet
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-paper-dim">
          Connect your institution's Midnight wallet from the top right to
          issue and manage credentials.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-paper">Dashboard</h1>
        <p className="mt-1 text-sm text-paper-dim">
          An overview of your institution's credential activity.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Issued" value={counts?.total ?? "—"} />
        <StatCard label="Active" value={counts?.active ?? "—"} />
        <StatCard label="Revoked" value={counts?.revoked ?? "—"} />
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-paper-muted">
          Quick actions
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <QuickAction
            href="/dashboard/issue"
            icon={IconGraduationCap}
            title="Issue Credentials"
            description="Mint a new zero-knowledge academic credential."
          />
          <QuickAction
            href="/dashboard/registry"
            icon={IconDatabase}
            title="Registry"
            description="Search, download, or revoke issued credentials."
          />
          <QuickAction
            href="/dashboard/verification"
            icon={IconShieldCheck}
            title="Verification"
            description="Run a quick internal proof check on a credential."
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-paper/10 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-paper-muted">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-paper">{value}</p>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof IconGraduationCap;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-lg border border-paper/10 p-5 transition hover:border-gold-500"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink-800 text-paper">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 font-semibold text-paper">{title}</p>
      <p className="mt-1 text-sm text-paper-dim">{description}</p>
    </Link>
  );
}
