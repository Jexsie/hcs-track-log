import { formatUtc, shortHash } from "@/lib/timeline/format";
import type { ParcelContentDto } from "@/lib/timeline/dto";
import type { ParcelVerdict } from "@/lib/verify/verdicts";
import styles from "./parcel-summary.module.css";

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
    <section className={styles.card} aria-labelledby="parcel-heading">
      <h2 id="parcel-heading" className={styles.title}>
        {consignment.description}
      </h2>
      <p className={styles.id} title={parcelHash}>
        Tracking ID <code>{parcelHash}</code>
      </p>

      <dl className={styles.grid}>
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
        className={`${styles.check} ${verdict ? styles[verdict.status] : styles.pending}`}
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
                <code title={verdict.recomputedParcelHash}>
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
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
