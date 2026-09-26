import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "hcs-track-log — Cargo & Package Tracker",
  description:
    "Track a parcel and verify every shipment event against the Hedera Consensus Service.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-[880px] items-center justify-between gap-4 px-4 py-3.5">
            <Link href="/" className="font-bold text-fg no-underline">
              hcs<span className="text-accent">·</span>track-log
            </Link>
            <span className="text-sm text-muted">Tamper-evident cargo tracking on Hedera</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
