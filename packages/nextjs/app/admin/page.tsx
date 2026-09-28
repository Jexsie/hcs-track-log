import Link from "next/link";

const ACTIONS = [
  {
    href: "/admin/parcels/new",
    title: "Register a parcel",
    body: "Enter consignment, parties and booking details with the first event. The server derives the tracking ID and schedules the anchor on HCS.",
  },
  {
    href: "/admin/events/new",
    title: "Record an event",
    body: "Propose a status update for an existing parcel. It is anchored as its own HCS message once approved.",
  },
  {
    href: "/admin/approvals",
    title: "Approve pending submissions",
    body: "Check each proposal against the ledger and approve it from your wallet. It executes once enough administrators approve.",
  },
];

export default function AdminHome() {
  return (
    <>
      <section>
        <h1 className="mb-1 text-2xl font-bold">Administrator console</h1>
        <p className="m-0 max-w-[65ch] text-muted">
          Nothing is written to the topic by this server. Each submission becomes a Hedera scheduled
          transaction that the network executes only when the topic&apos;s threshold of submit-key
          holders approve it in their own wallets.
        </p>
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-[14px] border border-line bg-surface p-5 text-fg no-underline transition-colors hover:border-accent"
          >
            <strong className="block text-lg text-accent">{a.title} →</strong>
            <span className="mt-1 block text-sm text-muted">{a.body}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
