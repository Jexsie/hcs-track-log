import type { CargoEvent } from "@/lib/canonical/event";
import type { Parcel } from "@/lib/canonical/parcel";

export interface SubmissionReceipt {
  sequenceNumber: bigint;
  transactionId: string;
  payerAccountId: string;
}

/** Writes an envelope to the ledger. Resolves only after consensus success. */
export interface EnvelopeSubmitter {
  submit(message: Uint8Array): Promise<SubmissionReceipt>;
}

/** An event that has reached consensus, ready to be cached in Postgres. */
export interface RecordedEvent {
  parcelHash: string;
  event: CargoEvent;
  hcsSequenceNumber: bigint;
  /** Convenience copy only; NOT covered by payloadHash. The mirror node is authoritative. */
  payerAccountId: string;
}

/** The derived read cache. Only ever written after the ledger accepted the event. */
export interface TrackingStore {
  parcelExists(parcelHash: string): Promise<boolean>;
  /** Insert the parcel and its first event atomically. */
  insertParcelWithFirstEvent(parcel: Parcel, event: RecordedEvent): Promise<void>;
  insertEvent(event: RecordedEvent): Promise<void>;
}
