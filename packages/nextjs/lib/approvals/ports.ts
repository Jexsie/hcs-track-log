import type { CargoEvent } from "@/lib/cargo/event";
import type { Parcel } from "@/lib/cargo/parcel";

/** An event that has reached consensus, ready to be cached in Postgres. */
export interface RecordedEvent {
  parcelHash: string;
  event: CargoEvent;
  hcsSequenceNumber: bigint;
  /** Convenience copy only; NOT covered by payloadHash. The mirror node is authoritative. */
  payerAccountId: string;
}

/** Read access to the cache, to refuse proposals for unknown or already registered parcels. */
export interface ParcelCache {
  parcelExists(parcelHash: string): Promise<boolean>;
}

export interface ScheduledSubmission {
  scheduleId: string;
  expiresAt: Date;
}

/** Wraps an envelope in a Hedera scheduled transaction; nothing reaches the topic until approved. */
export interface EnvelopeScheduler {
  schedule(message: Uint8Array, memo: string): Promise<ScheduledSubmission>;
}

export type SubmissionKind = "register-parcel" | "record-event";
export type SubmissionStatus = "pending" | "executed" | "expired" | "rejected";

/** A submission awaiting (or done with) multi-party wallet approval. */
export interface PendingSubmission {
  id: string;
  kind: SubmissionKind;
  parcelHash: string;
  /** Normalized parcel, for register-parcel only. */
  parcel: Parcel | null;
  /** Normalized event: exactly what was hashed into the scheduled envelope. */
  event: CargoEvent;
  scheduleId: string;
  expiresAt: Date;
  proposedBy: string;
  proposedAt: Date;
  status: SubmissionStatus;
  statusReason: string | null;
  hcsSequenceNumber: bigint | null;
}

export type NewSubmission = Pick<
  PendingSubmission,
  "id" | "kind" | "parcelHash" | "parcel" | "event" | "scheduleId" | "expiresAt" | "proposedBy"
>;

export interface PendingStore {
  insert(submission: NewSubmission): Promise<PendingSubmission>;
  get(id: string): Promise<PendingSubmission | null>;
  listOpen(): Promise<PendingSubmission[]>;
  hasOpenRegistration(parcelHash: string): Promise<boolean>;
  /** Write the anchored content to the read cache AND mark executed, atomically. */
  complete(submission: PendingSubmission, recorded: RecordedEvent): Promise<void>;
  close(id: string, status: "expired" | "rejected", reason: string): Promise<void>;
}
