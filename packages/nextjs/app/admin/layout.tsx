import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { TokenPanel } from "@/app/components/admin/token-panel";

export const metadata: Metadata = {
  title: "Administrator console — hcs-track-log",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin/parcels/new", label: "Register parcel" },
  { href: "/admin/events/new", label: "Record event" },
];

/** Violet-themed console for authorized submitters. Every write goes through the token-gated API. */
export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div data-theme="admin" className="min-h-dvh bg-bg text-fg">
      <header className="bg-band text-band-fg">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5">
          <Link
            href="/admin"
            className="flex items-center gap-2.5 font-bold text-band-fg no-underline"
          >
            hcs·track-log
            <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-bold tracking-wider text-white uppercase">
              Admin
            </span>
          </Link>
          <nav aria-label="Administrator" className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-band-fg no-underline hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/"
            className="ml-auto text-sm text-band-fg/80 no-underline hover:text-band-fg"
          >
            Public tracker ↗
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-[960px] gap-5 px-4 pt-6 pb-16">
        <TokenPanel />
        {children}
      </main>
    </div>
  );
}
