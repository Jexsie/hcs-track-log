import { randomUUID } from "node:crypto";
import { ValidationError } from "@/lib/canonical/errors";
import type { CargoEvent } from "@/lib/canonical/event";
import { buildEnvelope, serializeEnvelope } from "@/lib/envelope/envelope";
import { computePayloadHash } from "@/lib/hashing/payload-hash";
import { parseTrackingId } from "@/lib/hashing/sha256";
import { prepareEvent } from "@/lib/tracking/anchor";
import {
  ParcelExistsError,
  ParcelNotFoundError,
  SubmissionFailedError,
} from "@/lib/tracking/errors";
import type { TrackingStore } from "@/lib/tracking/ports";
import { prepareRegistration } from "@/lib/tracking/register-parcel";
import type { EnvelopeScheduler, NewSubmission, PendingStore, PendingSubmission } from "./ports";

export interface ProposeDeps {
  scheduler: EnvelopeScheduler;
  pending: PendingStore;
  cache: Pick<TrackingStore, "parcelExists">;
  /** Account id of the signed-in administrator. */
  proposedBy: string;
  now?: () => Date;
}

/**
 * Schedule the envelope on-chain, then stage the content. Nothing is written to the read cache:
 * that happens only in finalizeSubmission, after the network executes the approved schedule.
 */
async function stage(
  base: Omit<NewSubmission, "id" | "scheduleId" | "expiresAt">,
  { scheduler, pending }: ProposeDeps,
): Promise<PendingSubmission> {
  const id = randomUUID();
  const payloadHash = await computePayloadHash(base.event);
  const message = serializeEnvelope(buildEnvelope({ parcelHash: base.parcelHash, payloadHash }));
  let scheduled;

  try {
    // The memo is public: an opaque submission id only, never business data.
    scheduled = await scheduler.schedule(message, `hcs-track-log approval ${id}`);
  } catch (error) {
    throw new SubmissionFailedError(error);
  }

  return pending.insert({
    ...base,
    id,
    scheduleId: scheduled.scheduleId,
    expiresAt: scheduled.expiresAt,
  });
}

export async function proposeRegistration(
  input: { parcel: unknown; firstEvent: unknown },
  deps: ProposeDeps,
): Promise<PendingSubmission> {
  const { parcel, event, parcelHash } = await prepareRegistration(
    input,
    (deps.now ?? (() => new Date()))(),
  );

  if (
    (await deps.cache.parcelExists(parcelHash)) ||
    (await deps.pending.hasOpenRegistration(parcelHash))
  ) {
    throw new ParcelExistsError(parcelHash);
  }

  return stage(
    { kind: "register-parcel", parcelHash, parcel, event, proposedBy: deps.proposedBy },
    deps,
  );
}

export async function proposeEvent(
  input: { parcelHash: unknown; event: unknown },
  deps: ProposeDeps,
): Promise<PendingSubmission> {
  const parcelHash =
    typeof input.parcelHash === "string" ? parseTrackingId(input.parcelHash) : null;

  if (!parcelHash) throw new ValidationError("parcelHash", "must be a 64-character hex SHA-256");
  const event: CargoEvent = prepareEvent(input.event);

  if (!(await deps.cache.parcelExists(parcelHash))) throw new ParcelNotFoundError(parcelHash);

  return stage(
    { kind: "record-event", parcelHash, parcel: null, event, proposedBy: deps.proposedBy },
    deps,
  );
}
