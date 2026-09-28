import { PageShell } from "@/app/components/page-shell";
import { TrackSearch } from "@/app/components/track-search";
import { readLedgerLinks } from "@/lib/server/ledger-links";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <PageShell>
      <section>
        <h1 className="mb-2 text-[clamp(1.7rem,4vw,2.3rem)] leading-tight font-bold">
          Track your shipment
        </h1>
        <p className="mb-6 max-w-[58ch] text-muted">
          Every update is recorded on Hedera, a public ledger, so you can see your cargo&apos;s
          journey and know nothing has been changed.
        </p>
        <TrackSearch ledger={readLedgerLinks()} />
      </section>
    </PageShell>
  );
}
