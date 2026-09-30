import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { type AdminConfig, AdminProvider } from "@/app/components/admin/admin-context";
import { StaffNav } from "@/app/components/admin/staff-nav";
import { WalletPanel } from "@/app/components/admin/wallet-panel";
import { BrandMark } from "@/app/components/brand-mark";
import { BRAND } from "@/lib/cargo/brand";
import {
  ConfigError,
  readMirrorNodeUrl,
  readNetwork,
  readTopicId,
  readWalletConnectProjectId,
} from "@/lib/server/config/env";

export const metadata: Metadata = {
  title: `${BRAND.portal} — ${BRAND.name}`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function readConfig(): AdminConfig | null {
  try {
    return {
      network: readNetwork(),
      topicId: readTopicId(),
      mirrorBaseUrl: readMirrorNodeUrl(),
      projectId: readWalletConnectProjectId(),
    };
  } catch (error) {
    if (error instanceof ConfigError) return null;
    throw error;
  }
}

/** Violet-themed console. Every write is proposed here and approved in administrators' wallets. */
export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const config = readConfig();

  return (
    <div data-theme="admin" className="min-h-dvh bg-bg text-fg">
      <header className="bg-band text-band-fg">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5">
          <Link
            href="/admin"
            className="flex items-center gap-2.5 font-bold text-band-fg no-underline"
          >
            <BrandMark />
            <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-bold tracking-wider text-white uppercase">
              {BRAND.portal}
            </span>
          </Link>
          <StaffNav />
          <Link
            href="/"
            className="ml-auto text-sm text-band-fg/80 no-underline hover:text-band-fg"
          >
            Customer tracking
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-[960px] gap-5 px-4 pt-6 pb-16">
        {config ? (
          <AdminProvider config={config}>
            <WalletPanel />
            {children}
          </AdminProvider>
        ) : (
          <section className="rounded-xl border-2 border-danger bg-surface p-5" role="alert">
            <h1 className="mt-0 mb-1 text-xl font-bold">The staff portal is not set up yet</h1>
            <p className="m-0 text-muted">
              Finish the server setup (see the README), then restart it.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
