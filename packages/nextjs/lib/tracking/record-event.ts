import { ValidationError } from "@/lib/canonical/errors";
import { parseTrackingId } from "@/lib/hashing/sha256";
import { anchorEvent, prepareEvent } from "./anchor";
import { DerivedWriteError, ParcelNotFoundError } from "./errors";
import type { EnvelopeSubmitter, RecordedEvent, TrackingStore } from "./ports";

export interface RecordEventDeps {
  submitter: EnvelopeSubmitter;
  store: TrackingStore;
}

/**
 * Record one cargo event, HCS-first:
 * validate → canonicalize → SHA-256 → envelope → submit → consensus → THEN write Postgres.
 */
export async function recordCargoEvent(
  input: { parcelHash: unknown; event: unknown },
  { submitter, store }: RecordEventDeps,
): Promise<RecordedEvent> {
  const parcelHash =
    typeof input.parcelHash === "string" ? parseTrackingId(input.parcelHash) : null;

  if (!parcelHash) throw new ValidationError("parcelHash", "must be a 64-character hex SHA-256");
  const event = prepareEvent(input.event);

  if (!(await store.parcelExists(parcelHash))) throw new ParcelNotFoundError(parcelHash);

  const recorded = await anchorEvent(parcelHash, event, submitter);

  try {
    await store.insertEvent(recorded);
  } catch (error) {
    throw new DerivedWriteError(recorded, null, error);
  }

  return recorded;
}
