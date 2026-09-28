import Link from "next/link";

const ACTIONS = [
  {
    href: "/admin/parcels/new",
    title: "New shipment",
    body: "Register a shipment and its first update.",
  },
  { href: "/admin/events/new", title: "Add update", body: "Record a new status for a shipment." },
  { href: "/admin/approvals", title: "Approvals", body: "Review and approve pending changes." },
];

export default function AdminHome() {
  return (
    <>
      <section>
        <h1 className="mb-1 text-2xl font-bold">Admin</h1>
        <p className="m-0 text-muted">
          Every change needs approval from more than one admin before customers see it.
        </p>
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-[14px] border border-line bg-surface p-5 text-fg no-underline transition-colors hover:border-accent"
          >
            <strong className="block text-lg text-accent">{a.title}</strong>
            <span className="mt-1 block text-sm text-muted">{a.body}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
