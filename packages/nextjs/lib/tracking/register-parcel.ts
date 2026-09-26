import { ValidationError } from "@/lib/canonical/errors";
import { type Parcel, normalizeParcel } from "@/lib/canonical/parcel";
import { computeParcelHash } from "@/lib/hashing/parcel-hash";
import { anchorEvent, prepareEvent } from "./anchor";
import { DerivedWriteError, ParcelExistsError } from "./errors";
import type { EnvelopeSubmitter, RecordedEvent, TrackingStore } from "./ports";

export interface RegisterParcelDeps {
  submitter: EnvelopeSubmitter;
  store: TrackingStore;
  now?: () => Date;
}

export interface RegisteredParcel {
  parcelHash: string;
  parcel: Parcel;
  firstEvent: RecordedEvent;
}

/** Whole-second UTC, matching the canonical timestamp format. */
function toWholeSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

/**
 * Register a parcel together with its first event. `createdAt` is always assigned here, never taken
 * from the client. The parcel only reaches Postgres once its first event has reached consensus, so
 * every cached parcel is anchored on the ledger.
 */
export async function registerParcel(
  input: { parcel: unknown; firstEvent: unknown },
  { submitter, store, now = () => new Date() }: RegisterParcelDeps,
): Promise<RegisteredParcel> {
  if (typeof input.parcel !== "object" || input.parcel === null || Array.isArray(input.parcel)) {
    throw new ValidationError("parcel", "must be an object");
  }
  const parcel = normalizeParcel({ ...input.parcel, createdAt: toWholeSecond(now()) });
  const event = prepareEvent(input.firstEvent);
  const parcelHash = await computeParcelHash(parcel);
  if (await store.parcelExists(parcelHash)) throw new ParcelExistsError(parcelHash);

  const firstEvent = await anchorEvent(parcelHash, event, submitter);
  try {
    await store.insertParcelWithFirstEvent(parcel, firstEvent);
  } catch (error) {
    throw new DerivedWriteError(firstEvent, parcel, error);
  }
  return { parcelHash, parcel, firstEvent };
}
