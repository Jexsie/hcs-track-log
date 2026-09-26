import type { CargoEventInput } from "@/lib/canonical/event";
import type { ParcelInput } from "@/lib/canonical/parcel";
import type { StoredEvent, StoredParcel } from "@/lib/db/rows";
import type { EventToVerify } from "@/lib/verify/verify-event";

/** Stored content as JSON. Timestamps are ISO strings, decimals stay fixed-scale strings. */
export type ParcelContentDto = Omit<ParcelInput, "createdAt"> & { createdAt: string };
export type EventContentDto = Omit<CargoEventInput, "timestamp"> & { timestamp: string };

export interface EventDto {
  id: string;
  /** Decimal string: BIGINT does not fit a JSON number. */
  hcsSequenceNumber: string;
  /** Convenience copy only; NOT covered by payloadHash. */
  payerAccountId: string;
  recordedAt: string;
  content: EventContentDto;
}

/**
 * What the read path serves: raw stored CONTENT, never a hash to trust. The only hash is the
 * searched tracking ID; the verifier recomputes everything else.
 */
export interface TimelineDto {
  parcelHash: string;
  parcel: ParcelContentDto;
  events: EventDto[];
}

const iso = (value: string | Date) => (value instanceof Date ? value.toISOString() : value);

export function toTimelineDto(parcel: StoredParcel, events: readonly StoredEvent[]): TimelineDto {
  return {
    parcelHash: parcel.parcelHash,
    parcel: { ...parcel.content, createdAt: iso(parcel.content.createdAt) },
    events: events.map((e) => ({
      id: e.id,
      hcsSequenceNumber: e.hcsSequenceNumber.toString(),
      payerAccountId: e.payerAccountId,
      recordedAt: e.recordedAt.toISOString(),
      content: { ...e.content, timestamp: iso(e.content.timestamp) },
    })),
  };
}

export function eventsToVerify(dto: TimelineDto): EventToVerify[] {
  return dto.events.map((e) => ({
    hcsSequenceNumber: BigInt(e.hcsSequenceNumber),
    content: e.content,
  }));
}
