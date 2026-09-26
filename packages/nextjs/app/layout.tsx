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
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              hcs<span>·</span>track-log
            </Link>
            <span className="tagline">Tamper-evident cargo tracking on Hedera</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
