import { type CargoEvent, normalizeCargoEvent } from "@/lib/canonical/event";
import { buildEnvelope, serializeEnvelope } from "@/lib/envelope/envelope";
import { computePayloadHash } from "@/lib/hashing/payload-hash";
import { SubmissionFailedError } from "./errors";
import type { EnvelopeSubmitter, RecordedEvent } from "./ports";

/** Normalize an event before any side effect, so invalid input never reaches the ledger. */
export function prepareEvent(input: unknown): CargoEvent {
  return normalizeCargoEvent(input);
}

/**
 * Hash the event, submit the blind envelope, and wait for consensus. Performs no database I/O;
 * the returned RecordedEvent is what the caller may then cache.
 */
export async function anchorEvent(
  parcelHash: string,
  event: CargoEvent,
  submitter: EnvelopeSubmitter,
): Promise<RecordedEvent> {
  const payloadHash = await computePayloadHash(event);
  const message = serializeEnvelope(buildEnvelope({ parcelHash, payloadHash }));
  let receipt;
  try {
    receipt = await submitter.submit(message);
  } catch (error) {
    throw new SubmissionFailedError(error);
  }
  return {
    parcelHash,
    event,
    hcsSequenceNumber: receipt.sequenceNumber,
    payerAccountId: receipt.payerAccountId,
  };
}
