import type { ReactNode } from "react";
import type { SubmissionDto } from "@/lib/approvals/dto";
import { formatUtc } from "@/lib/timeline/format";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm wrap-anywhere">{children}</dd>
    </div>
  );
}

/** Exactly the details being approved. */
export function SubmissionSummary({ submission }: { submission: SubmissionDto }) {
  const { parcel, event } = submission;
  return (
    <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-5 gap-y-2.5">
      {parcel && (
        <>
          <Row label="Shipment">{parcel.consignment.description}</Row>
          <Row label="Packages">
            {parcel.consignment.packageCount} × {parcel.consignment.packageType}
          </Row>
          <Row label="Weight / volume">
            {parcel.consignment.grossMassKg} kg · {parcel.consignment.volumeCubicMeters} m³
          </Row>
          <Row label="From → to">
            {parcel.parties.shipper} → {parcel.parties.consignee}
          </Row>
          <Row label="Booking reference">{parcel.bookingRef}</Row>
        </>
      )}
      <Row label="Status">
        {event.status} · {event.location}
      </Row>
      <Row label="Carrier">{event.carrier.name}</Row>
      <Row label="Time">{formatUtc(event.timestamp)}</Row>
      <Row label="Tracking ID">
        <span className="font-mono text-xs">{submission.parcelHash}</span>
      </Row>
    </dl>
  );
}
