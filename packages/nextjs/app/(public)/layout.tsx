import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/app/components/brand-mark";

export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[880px] items-center justify-between gap-4 px-4 py-3.5">
          <Link href="/" className="font-bold text-fg no-underline">
            <BrandMark />
          </Link>
          <span className="text-sm text-muted">Shipment tracking</span>
        </div>
      </header>
      {children}
    </>
  );
}
