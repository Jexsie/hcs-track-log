import Link from "next/link";
import type { ReactNode } from "react";

export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[880px] items-center justify-between gap-4 px-4 py-3.5">
          <Link href="/" className="font-bold text-fg no-underline">
            hcs<span className="text-accent">·</span>track-log
          </Link>
          <span className="text-sm text-muted">Tamper-evident cargo tracking on Hedera</span>
        </div>
      </header>
      {children}
    </>
  );
}
