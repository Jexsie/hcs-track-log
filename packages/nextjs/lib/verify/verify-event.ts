import { ValidationError } from "@/lib/canonical/errors";
import { EnvelopeError, parseEnvelope } from "@/lib/envelope/envelope";
import { computePayloadHash } from "@/lib/hashing/payload-hash";
import { MirrorNotFoundError } from "@/lib/mirror/http";
import type { MirrorClient } from "@/lib/mirror/mirror-client";
import type { EventVerdict } from "./verdicts";

export interface EventToVerify {
  hcsSequenceNumber: bigint;
  /** Raw stored content (e.g. Postgres columns). No hash is accepted here, by design. */
  content: unknown;
}

/**
 * Verify one event against the ledger:
 *   1. recompute SHA-256 from the stored CONTENT via the shared canonical builder,
 *   2. fetch the HCS message at the event's sequence number from the mirror node,
 *   3. require on-chain parcelHash == searched tracking ID and on-chain payloadHash == recomputed.
 */
export async function verifyEvent(
  searchedParcelHash: string,
  event: EventToVerify,
  mirror: Pick<MirrorClient, "getMessage" | "messageUrl">,
): Promise<EventVerdict> {
  const sequenceNumber = event.hcsSequenceNumber;
  const base = { sequenceNumber, mirrorUrl: mirror.messageUrl(sequenceNumber) };
  const tampered = (
    reason: Extract<EventVerdict, { status: "tampered" }>["reason"],
    message: string,
    recomputedPayloadHash: string | null,
    onChainPayloadHash: string | null = null,
  ): EventVerdict => ({
    ...base,
    status: "tampered",
    reason,
    message,
    recomputedPayloadHash,
    onChainPayloadHash,
  });

  let recomputed: string;
  try {
    recomputed = await computePayloadHash(event.content);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return tampered("invalid-content", `stored content is invalid (${error.message})`, null);
  }

  let onChain;
  try {
    onChain = await mirror.getMessage(sequenceNumber);
  } catch (error) {
    if (error instanceof MirrorNotFoundError) {
      return tampered(
        "no-anchor",
        `no ledger message exists at sequence ${sequenceNumber}`,
        recomputed,
      );
    }
    return {
      ...base,
      status: "unavailable",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  let envelope;
  try {
    envelope = parseEnvelope(onChain.message);
  } catch (error) {
    if (!(error instanceof EnvelopeError)) throw error;
    return tampered(
      "not-an-envelope",
      `ledger message is not an event envelope (${error.message})`,
      recomputed,
    );
  }

  if (envelope.parcelHash !== searchedParcelHash) {
    return tampered(
      "wrong-parcel",
      "ledger message anchors a different parcel",
      recomputed,
      envelope.payloadHash,
    );
  }
  if (envelope.payloadHash !== recomputed) {
    return tampered(
      "content-mismatch",
      "stored content does not match the hash anchored on the ledger",
      recomputed,
      envelope.payloadHash,
    );
  }
  return {
    ...base,
    status: "verified",
    payloadHash: recomputed,
    consensusTimestamp: onChain.consensusTimestamp,
    ledgerPayer: onChain.payerAccountId,
  };
}
