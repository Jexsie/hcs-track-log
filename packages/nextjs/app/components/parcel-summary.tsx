import type { EventContentDto, ParcelContentDto } from "@/lib/timeline/dto";
import { formatUtc } from "@/lib/timeline/format";
import type { ParcelVerdict } from "@/lib/verify/verdicts";
import { CopyButton } from "./copy-button";
import { AlertIcon, CheckIcon, PinIcon } from "./icons";

/** The shipment as a waybill: current status first, then the route, the facts and the tracking ID. */
export function ParcelSummary({
  parcelHash,
  parcel,
  latest,
  verdict,
}: {
  parcelHash: string;
  parcel: ParcelContentDto;
  latest: EventContentDto | null;
  verdict: ParcelVerdict | null;
}) {
  const { consignment, parties } = parcel;
  const facts = [
    ["Packages", `${String(consignment.packageCount)} × ${consignment.packageType}`],
    ["Weight", `${String(consignment.grossMassKg)} kg`],
    ["Volume", `${String(consignment.volumeCubicMeters)} m³`],
    ["Booking", parcel.bookingRef],
  ] as const;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-line bg-surface"
      aria-labelledby="parcel-heading"
    >
      <div className="grid gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-sm text-muted">{consignment.description}</p>
            <h2
              id="parcel-heading"
              className="mt-1 mb-0 text-2xl leading-tight font-bold sm:text-3xl"
            >
              {latest?.status ?? "Registered"}
            </h2>
            {latest && (
              <p className="mt-1.5 mb-0 flex items-center gap-1.5 text-sm text-muted">
                <PinIcon className="size-4 flex-none text-cargo" />
                <span className="min-w-0 wrap-anywhere">
                  {latest.location} · {formatUtc(latest.timestamp)}
                </span>
              </p>
            )}
          </div>
          {verdict?.status === "verified" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
              <CheckIcon className="size-3.5" /> Details verified
            </span>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3" aria-label="Route">
          <div className="min-w-0">
            <p className="m-0 text-xs text-muted">From</p>
            <p className="m-0 font-semibold wrap-anywhere">{parties.shipper}</p>
          </div>
          <div className="flex w-16 items-center sm:w-32" aria-hidden>
            <span className="size-2 rounded-full bg-cargo" />
            <span className="h-0.5 flex-1 bg-[repeating-linear-gradient(90deg,var(--cargo)_0_6px,transparent_6px_10px)]" />
            <span className="size-2 rounded-full border-2 border-cargo" />
          </div>
          <div className="min-w-0 text-right">
            <p className="m-0 text-xs text-muted">To</p>
            <p className="m-0 font-semibold wrap-anywhere">{parties.consignee}</p>
          </div>
        </div>
      </div>

      <dl className="m-0 grid grid-cols-2 border-t border-line sm:grid-cols-4">
        {facts.map(([label, value], i) => (
          <div
            key={label}
            className={`px-5 py-3 ${i % 2 === 1 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}
          >
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center gap-3 border-t border-line bg-surface-2 px-5 py-3">
        <span className="text-xs text-muted">Tracking ID</span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs" title={parcelHash}>
          {parcelHash}
        </code>
        <CopyButton value={parcelHash} label="Copy tracking ID" />
      </div>

      {verdict?.status === "tampered" && (
        <p
          className="m-0 flex items-start gap-2 border-t border-danger bg-danger-soft px-5 py-3 text-sm font-semibold text-danger"
          role="alert"
        >
          <AlertIcon className="mt-0.5 size-4 flex-none" /> These shipment details were changed
          after they were recorded.
        </p>
      )}
    </section>
  );
}
