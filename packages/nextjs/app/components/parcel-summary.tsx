import type { ParcelContentDto } from "@/lib/timeline/dto";
import { formatUtc } from "@/lib/timeline/format";
import type { ParcelVerdict } from "@/lib/verify/verdicts";

export function ParcelSummary({
  parcelHash,
  parcel,
  verdict,
}: {
  parcelHash: string;
  parcel: ParcelContentDto;
  verdict: ParcelVerdict | null;
}) {
  const { consignment, parties } = parcel;
  return (
    <section
      className="rounded-[14px] border border-line bg-surface p-5"
      aria-labelledby="parcel-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="parcel-heading" className="m-0 text-xl font-bold">
          {consignment.description}
        </h2>
        {verdict?.status === "verified" && (
          <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok">
            Details verified
          </span>
        )}
      </div>
      <p className="mt-1.5 mb-4 font-mono text-xs wrap-anywhere text-muted">{parcelHash}</p>

      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-5 gap-y-3">
        <Item label="From" value={parties.shipper} />
        <Item label="To" value={parties.consignee} />
        <Item
          label="Packages"
          value={`${String(consignment.packageCount)} × ${consignment.packageType}`}
        />
        <Item label="Weight" value={`${String(consignment.grossMassKg)} kg`} />
        <Item label="Volume" value={`${String(consignment.volumeCubicMeters)} m³`} />
        <Item label="Booking reference" value={parcel.bookingRef} />
        <Item label="Registered" value={formatUtc(parcel.createdAt)} />
      </dl>

      {verdict?.status === "tampered" && (
        <p
          className="mt-4 mb-0 rounded-[10px] bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger"
          role="alert"
        >
          Warning: these shipment details were changed after they were recorded.
        </p>
      )}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 wrap-anywhere">{value}</dd>
    </div>
  );
}
