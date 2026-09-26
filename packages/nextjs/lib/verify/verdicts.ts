export type TamperReason =
  /** Hash recomputed from the stored content differs from the on-chain hash. */
  | "content-mismatch"
  /** The on-chain envelope anchors a different parcel. */
  | "wrong-parcel"
  /** Stored content no longer passes normalization, so it cannot be what was hashed. */
  | "invalid-content"
  /** The message at this sequence number is not a valid envelope. */
  | "not-an-envelope"
  /** There is no ledger message at this sequence number. */
  | "no-anchor";

interface EventVerdictBase {
  sequenceNumber: bigint;
  mirrorUrl: string;
}

export type EventVerdict =
  | (EventVerdictBase & {
      status: "verified";
      /** Recomputed from content; equal to the on-chain payloadHash. */
      payloadHash: string;
      consensusTimestamp: string;
      /** Authoritative payer, from the mirror node transaction record. */
      ledgerPayer: string;
    })
  | (EventVerdictBase & {
      status: "tampered";
      reason: TamperReason;
      message: string;
      recomputedPayloadHash: string | null;
      onChainPayloadHash: string | null;
    })
  | (EventVerdictBase & { status: "unavailable"; message: string });

export type ParcelVerdict =
  | { status: "verified"; parcelHash: string }
  | {
      status: "tampered";
      reason: "content-mismatch" | "invalid-content";
      message: string;
      recomputedParcelHash: string | null;
    };
