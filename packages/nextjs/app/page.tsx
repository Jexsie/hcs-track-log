import { PageShell } from "./components/page-shell";
import { SearchForm } from "./components/search-form";

const STEPS = [
  { title: "Instant timeline", body: "Events load from the database cache immediately." },
  {
    title: "Recompute, never trust",
    body: "Hashes are recomputed from the displayed content, not read from storage.",
  },
  {
    title: "Compare with the ledger",
    body: "Each hash is matched against its anchor on the mirror node. Any edit is flagged.",
  },
];

export default function HomePage() {
  return (
    <PageShell>
      <section>
        <h1 className="mb-2 text-[clamp(1.7rem,4vw,2.3rem)] leading-tight font-bold">
          Track a parcel. Verify every step.
        </h1>
        <p className="mb-6 max-w-[60ch] text-muted">
          Each shipment event is notarized on the Hedera Consensus Service. Enter a tracking ID to
          see its journey; your browser then recomputes every event&apos;s SHA-256 from the data
          shown and checks it against the public ledger.
        </p>
        <SearchForm />
      </section>

      <ol
        className="grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5 p-0"
        aria-label="How verification works"
      >
        {STEPS.map((step, i) => (
          <li key={step.title} className="rounded-xl border border-line bg-surface p-4">
            <span className="mb-2 inline-grid size-[26px] place-items-center rounded-full bg-accent text-sm font-bold text-white">
              {i + 1}
            </span>
            <strong className="mb-1 block">{step.title}</strong>
            <span className="text-sm text-muted">{step.body}</span>
          </li>
        ))}
      </ol>
    </PageShell>
  );
}
