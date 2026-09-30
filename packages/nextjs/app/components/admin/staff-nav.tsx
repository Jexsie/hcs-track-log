"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin/parcels/new", label: "New shipment" },
  { href: "/admin/events/new", label: "Add update" },
  { href: "/admin/approvals", label: "Approvals" },
];

/** Staff navigation with the current page highlighted. */
export function StaffNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Staff" className="flex flex-wrap gap-1">
      {NAV.map((item) => {
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-band-fg no-underline ${
              active ? "bg-white/15" : "opacity-80 hover:bg-white/10 hover:opacity-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
