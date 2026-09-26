import { RecordEventForm } from "@/app/components/admin/record-event-form";
import { readLedgerLinks } from "@/lib/server/ledger-links";

export const dynamic = "force-dynamic";

export default async function RecordEventPage({
  searchParams,
}: {
  searchParams: Promise<{ parcel?: string | string[] }>;
}) {
  const { parcel } = await searchParams;
  return (
    <>
      <section>
        <h1 className="mb-1 text-2xl font-bold">Record an event</h1>
        <p className="m-0 text-muted">Anchors one status update for an existing parcel.</p>
      </section>
      <RecordEventForm
        initialParcelHash={typeof parcel === "string" ? parcel : ""}
        ledger={readLedgerLinks()}
      />
    </>
  );
}
