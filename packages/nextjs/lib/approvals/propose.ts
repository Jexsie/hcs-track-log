import { randomUUID } from "node:crypto";
import { ValidationError } from "@/lib/notary/errors";
import { type CargoEvent, normalizeCargoEvent, computePayloadHash } from "@/lib/cargo/event";
import { type Parcel, normalizeParcel, computeParcelHash } from "@/lib/cargo/parcel";
import { buildEnvelope, serializeEnvelope } from "@/lib/notary/envelope";
import { parseTrackingId } from "@/lib/notary/sha256";
import { ParcelExistsError, ParcelNotFoundError, SubmissionFailedError } from "./errors";
import type {
  EnvelopeScheduler,
  NewSubmission,
  ParcelCache,
  PendingStore,
  PendingSubmission,
} from "./ports";

export interface ProposeDeps {
  scheduler: EnvelopeScheduler;
  pending: PendingStore;
  cache: ParcelCache;
  /** Account id of the signed-in administrator. */
  proposedBy: string;
  now?: () => Date;
}

/** Whole-second UTC, matching the canonical timestamp format. */
function toWholeSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

/**
 * Validate a registration and derive its tracking ID. `createdAt` is always assigned here from
 * `now`, never taken from the client.
 */
async function prepareRegistration(
  input: { parcel: unknown; firstEvent: unknown },
  now: Date,
): Promise<{ parcel: Parcel; event: CargoEvent; parcelHash: string }> {
  if (typeof input.parcel !== "object" || input.parcel === null || Array.isArray(input.parcel)) {
    throw new ValidationError("parcel", "must be an object");
  }

  const parcel = normalizeParcel({ ...input.parcel, createdAt: toWholeSecond(now) });
  const event = normalizeCargoEvent(input.firstEvent);

  return { parcel, event, parcelHash: await computeParcelHash(parcel) };
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
  const event: CargoEvent = normalizeCargoEvent(input.event);

  if (!(await deps.cache.parcelExists(parcelHash))) throw new ParcelNotFoundError(parcelHash);

  return stage(
    { kind: "record-event", parcelHash, parcel: null, event, proposedBy: deps.proposedBy },
    deps,
  );
}
