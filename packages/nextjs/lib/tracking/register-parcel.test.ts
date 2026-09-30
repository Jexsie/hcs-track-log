import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/canonical/errors";
import { parseEnvelope } from "@/lib/envelope/envelope";
import { computeParcelHash } from "@/lib/hashing/parcel-hash";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { ControlledSubmitter, type Effect, InMemoryStore, InstantSubmitter } from "@/test/fakes";
import { ParcelExistsError, SubmissionFailedError } from "./errors";
import { registerParcel } from "./register-parcel";

const { createdAt: _createdAt, ...parcelFields } = referenceParcel;
const now = () => new Date("2026-09-20T08:15:00.789Z");

let log: Effect[];
let store: InMemoryStore;

beforeEach(() => {
  log = [];
  store = new InMemoryStore(log);
});

describe("registerParcel — HCS-first", () => {
  it("assigns createdAt server-side (whole seconds) and derives the tracking ID from it", async () => {
    const submitter = new InstantSubmitter(log);
    const result = await registerParcel(
      { parcel: parcelFields, firstEvent: referenceEvent },
      { submitter, store, now },
    );

    expect(result.parcel.createdAt).toBe("2026-09-20T08:15:00Z");
    expect(result.parcelHash).toBe(await computeParcelHash(referenceParcel));
    const [message] = submitter.messages;

    expect(message && parseEnvelope(message).parcelHash).toBe(result.parcelHash);
  });

  it("ignores a client-supplied createdAt", async () => {
    const submitter = new InstantSubmitter(log);
    const result = await registerParcel(
      {
        parcel: { ...parcelFields, createdAt: "1999-01-01T00:00:00Z" },
        firstEvent: referenceEvent,
      },
      { submitter, store, now },
    );

    expect(result.parcel.createdAt).toBe("2026-09-20T08:15:00Z");
  });

  it("inserts parcel and first event together, only after consensus", async () => {
    const submitter = new ControlledSubmitter(log);
    const pending = registerParcel(
      { parcel: parcelFields, firstEvent: referenceEvent },
      { submitter, store, now },
    );

    await vi.waitFor(() => expect(submitter.isPending).toBe(true));
    expect(store.parcels.size).toBe(0);

    submitter.succeed();
    const result = await pending;

    expect(log).toEqual(["submit:start", "submit:ok", "store:write"]);
    expect(store.parcels.get(result.parcelHash)).toEqual(result.parcel);
    expect(store.events).toEqual([result.firstEvent]);
  });

  it("writes nothing when submission fails", async () => {
    const submitter = new InstantSubmitter(log, new Error("network down"));

    await expect(
      registerParcel(
        { parcel: parcelFields, firstEvent: referenceEvent },
        { submitter, store, now },
      ),
    ).rejects.toThrow(SubmissionFailedError);
    expect(store.parcels.size).toBe(0);
    expect(store.events).toHaveLength(0);
  });

  it("refuses to re-register an existing parcel without submitting", async () => {
    await registerParcel(
      { parcel: parcelFields, firstEvent: referenceEvent },
      { submitter: new InstantSubmitter(log), store, now },
    );
    log.length = 0;
    await expect(
      registerParcel(
        { parcel: parcelFields, firstEvent: referenceEvent },
        { submitter: new InstantSubmitter(log), store, now },
      ),
    ).rejects.toThrow(ParcelExistsError);
    expect(log).toEqual([]);
  });

  it("validates both parcel and first event before submitting", async () => {
    const submitter = new InstantSubmitter(log);

    await expect(
      registerParcel(
        { parcel: { ...parcelFields, bookingRef: " " }, firstEvent: referenceEvent },
        { submitter, store, now },
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      registerParcel(
        { parcel: parcelFields, firstEvent: { ...referenceEvent, timestamp: "soon" } },
        { submitter, store, now },
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      registerParcel({ parcel: "nope", firstEvent: referenceEvent }, { submitter, store, now }),
    ).rejects.toThrow(ValidationError);
    expect(log).toEqual([]);
  });
});
