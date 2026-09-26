import Link from "next/link";

const ACTIONS = [
  {
    href: "/admin/parcels/new",
    title: "Register a parcel",
    body: "Enter consignment, parties and booking details with the first event. The server derives the tracking ID and anchors the event on HCS.",
  },
  {
    href: "/admin/events/new",
    title: "Record an event",
    body: "Append a status update to an existing parcel. Each event is anchored as its own HCS message before it is saved.",
  },
];

export default function AdminHome() {
  return (
    <>
      <section>
        <h1 className="mb-1 text-2xl font-bold">Administrator console</h1>
        <p className="m-0 max-w-[65ch] text-muted">
          Submissions are co-signed with the topic&apos;s threshold submit key and written to the
          database only after Hedera reaches consensus.
        </p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group rounded-[14px] border border-line bg-surface p-5 text-fg no-underline transition-colors hover:border-accent"
          >
            <strong className="block text-lg text-accent">{a.title} →</strong>
            <span className="mt-1 block text-sm text-muted">{a.body}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
