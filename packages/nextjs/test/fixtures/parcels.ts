import type { CargoEvent } from "@/lib/canonical/event";
import { type Parcel, normalizeParcel } from "@/lib/canonical/parcel";
import { computeParcelHash } from "@/lib/hashing/parcel-hash";
import type { RecordedEvent } from "@/lib/tracking/ports";
import { referenceEvent, referenceParcel } from "./records";

export const normalizedReferenceParcel: Parcel = normalizeParcel(referenceParcel);

export async function parcelFixture(overrides: Partial<Parcel> = {}) {
  const parcel: Parcel = { ...normalizedReferenceParcel, ...overrides };
  return { parcel, parcelHash: await computeParcelHash(parcel) };
}

export function recordedEvent(
  parcelHash: string,
  hcsSequenceNumber: bigint,
  event: Partial<CargoEvent> = {},
): RecordedEvent {
  return {
    parcelHash,
    hcsSequenceNumber,
    payerAccountId: "0.0.1001",
    event: { ...referenceEvent, timestamp: "2026-09-25T11:40:00Z", ...event },
  };
}
