/** Hedera refused to create the schedule. Nothing was staged or cached. */
export class SubmissionFailedError extends Error {
  constructor(cause: unknown) {
    super(`HCS submission failed: ${cause instanceof Error ? cause.message : String(cause)}`, {
      cause,
    });
    this.name = "SubmissionFailedError";
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
