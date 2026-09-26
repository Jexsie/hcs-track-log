import { formatUtc, shortHash } from "@/lib/timeline/format";
import type { ParcelContentDto } from "@/lib/timeline/dto";
import type { ParcelVerdict } from "@/lib/verify/verdicts";

const CHECK: Record<ParcelVerdict["status"] | "pending", string> = {
  pending: "bg-surface-2 text-muted",
  verified: "bg-ok-soft text-ok",
  tampered: "bg-danger-soft font-semibold text-danger",
};

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
      <h2 id="parcel-heading" className="m-0 text-xl font-bold">
        {consignment.description}
      </h2>
      <p className="mt-1.5 mb-4 text-sm wrap-anywhere text-muted" title={parcelHash}>
        Tracking ID <code className="font-mono">{parcelHash}</code>
      </p>

      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-5 gap-y-3">
        <Item label="Shipper" value={parties.shipper} />
        <Item label="Consignee" value={parties.consignee} />
        <Item
          label="Packages"
          value={`${String(consignment.packageCount)} × ${consignment.packageType}`}
        />
        <Item label="Gross mass" value={`${String(consignment.grossMassKg)} kg`} />
        <Item label="Volume" value={`${String(consignment.volumeCubicMeters)} m³`} />
        <Item label="Booking ref" value={parcel.bookingRef} />
        <Item label="Created" value={formatUtc(parcel.createdAt)} />
      </dl>

      <p
        className={`mt-4 mb-0 rounded-[10px] px-3 py-2.5 text-sm ${CHECK[verdict?.status ?? "pending"]}`}
        role="status"
      >
        {!verdict && "Recomputing tracking ID from parcel details…"}
        {verdict?.status === "verified" &&
          `✅ Parcel details hash to this tracking ID (recomputed ${shortHash(verdict.parcelHash)}).`}
        {verdict?.status === "tampered" && (
          <>
            ⚠️ Security warning: {verdict.message}.
            {verdict.recomputedParcelHash && (
              <>
                {" "}
                Recomputed{" "}
                <code className="font-mono" title={verdict.recomputedParcelHash}>
                  {shortHash(verdict.recomputedParcelHash)}
                </code>
                .
              </>
            )}
          </>
        )}
      </p>
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 wrap-anywhere">{value}</dd>
    </div>
  );
}
