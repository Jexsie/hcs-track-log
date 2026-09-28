import type { SubmissionDto } from "@/lib/approvals/dto";
import { formatUtc, shortHash } from "@/lib/timeline/format";

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted uppercase">{label}</dt>
      <dd className={`mt-0.5 text-sm wrap-anywhere ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

/** Exactly the content being approved: this is what the scheduled envelope commits to. */
export function SubmissionSummary({ submission }: { submission: SubmissionDto }) {
  const { parcel, event } = submission;
  return (
    <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-5 gap-y-2.5">
      {parcel && (
        <>
          <Row label="Consignment">{parcel.consignment.description}</Row>
          <Row label="Packages">
            {parcel.consignment.packageCount} × {parcel.consignment.packageType}
          </Row>
          <Row label="Mass / volume">
            {parcel.consignment.grossMassKg} kg · {parcel.consignment.volumeCubicMeters} m³
          </Row>
          <Row label="Shipper → consignee">
            {parcel.parties.shipper} → {parcel.parties.consignee}
          </Row>
          <Row label="Booking ref">{parcel.bookingRef}</Row>
          <Row label="Created">{formatUtc(parcel.createdAt)}</Row>
        </>
      )}
      <Row label="Event">
        {event.status} · {event.location}
      </Row>
      <Row label="Carrier">
        {event.carrier.name} ({event.carrier.scacCode})
      </Row>
      <Row label="Event time">{formatUtc(event.timestamp)}</Row>
      <Row label="Tracking ID" mono>
        <span title={submission.parcelHash}>{shortHash(submission.parcelHash)}</span>
      </Row>
    </dl>
  );
}
