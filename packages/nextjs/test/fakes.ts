import type { Parcel } from "@/lib/canonical/parcel";
import type {
  EnvelopeSubmitter,
  RecordedEvent,
  SubmissionReceipt,
  TrackingStore,
} from "@/lib/tracking/ports";

/** Shared, ordered log of side effects so tests can assert HCS-first ordering. */
export type Effect = "submit:start" | "submit:ok" | "submit:fail" | "store:write";

/** A submitter whose result the test resolves or rejects explicitly. */
export class ControlledSubmitter implements EnvelopeSubmitter {
  readonly messages: Uint8Array[] = [];
  private pending: { resolve: (r: SubmissionReceipt) => void; reject: (e: Error) => void } | null =
    null;
  private nextSequence = 1n;

  constructor(private readonly log: Effect[]) {}

  submit(message: Uint8Array): Promise<SubmissionReceipt> {
    this.log.push("submit:start");
    this.messages.push(message);
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  get isPending(): boolean {
    return this.pending !== null;
  }

  succeed(): void {
    const sequenceNumber = this.nextSequence++;
    this.log.push("submit:ok");
    this.take().resolve({
      sequenceNumber,
      transactionId: `0.0.1001@1758800400.${sequenceNumber}`,
      payerAccountId: "0.0.1001",
    });
  }

  fail(error: Error): void {
    this.log.push("submit:fail");
    this.take().reject(error);
  }

  private take() {
    if (!this.pending) throw new Error("no submission in flight");
    const p = this.pending;
    this.pending = null;
    return p;
  }
}

/** A submitter that settles immediately. */
export class InstantSubmitter extends ControlledSubmitter {
  constructor(
    log: Effect[],
    private readonly outcome: "ok" | Error = "ok",
  ) {
    super(log);
  }

  override submit(message: Uint8Array): Promise<SubmissionReceipt> {
    const result = super.submit(message);
    if (this.outcome === "ok") this.succeed();
    else this.fail(this.outcome);
    return result;
  }
}

export class InMemoryStore implements TrackingStore {
  readonly parcels = new Map<string, Parcel>();
  readonly events: RecordedEvent[] = [];
  failWritesWith: Error | null = null;

  constructor(private readonly log: Effect[]) {}

  async parcelExists(parcelHash: string): Promise<boolean> {
    return this.parcels.has(parcelHash);
  }

  async insertParcelWithFirstEvent(parcel: Parcel, event: RecordedEvent): Promise<void> {
    this.write();
    this.parcels.set(event.parcelHash, parcel);
    this.events.push(event);
  }

  async insertEvent(event: RecordedEvent): Promise<void> {
    this.write();
    this.events.push(event);
  }

  private write(): void {
    this.log.push("store:write");
    if (this.failWritesWith) throw this.failWritesWith;
  }
}
