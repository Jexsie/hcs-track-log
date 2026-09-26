import type { Parcel } from "@/lib/canonical/parcel";
import type { RecordedEvent } from "./ports";

/** The ledger did not accept the event. Nothing was written to Postgres. */
export class SubmissionFailedError extends Error {
  constructor(cause: unknown) {
    super(`HCS submission failed: ${cause instanceof Error ? cause.message : String(cause)}`, {
      cause,
    });
    this.name = "SubmissionFailedError";
  }
}

/**
 * The event IS anchored on the ledger but caching it in Postgres failed. The content is not on
 * chain, so `pending` must be persisted (retry the insert) or it is unrecoverable.
 */
export class DerivedWriteError extends Error {
  readonly hcsSequenceNumber: bigint;

  constructor(
    readonly pending: RecordedEvent,
    readonly parcel: Parcel | null,
    cause: unknown,
  ) {
    super(
      `event anchored at HCS sequence ${pending.hcsSequenceNumber} but the Postgres write failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
    this.name = "DerivedWriteError";
    this.hcsSequenceNumber = pending.hcsSequenceNumber;
  }
}

export class ParcelNotFoundError extends Error {
  constructor(readonly parcelHash: string) {
    super(`no parcel with tracking ID ${parcelHash}`);
    this.name = "ParcelNotFoundError";
  }
}

export class ParcelExistsError extends Error {
  constructor(readonly parcelHash: string) {
    super(`parcel ${parcelHash} is already registered`);
    this.name = "ParcelExistsError";
  }
}
