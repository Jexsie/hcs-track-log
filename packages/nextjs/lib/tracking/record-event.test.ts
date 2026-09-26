import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/canonical/errors";
import { parseEnvelope } from "@/lib/envelope/envelope";
import { computePayloadHash } from "@/lib/hashing/payload-hash";
import { REFERENCE_PARCEL_SHA256, referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { ControlledSubmitter, type Effect, InMemoryStore, InstantSubmitter } from "@/test/fakes";
import { DerivedWriteError, ParcelNotFoundError, SubmissionFailedError } from "./errors";
import { recordCargoEvent } from "./record-event";

const parcelHash = REFERENCE_PARCEL_SHA256;
let log: Effect[];
let store: InMemoryStore;

beforeEach(() => {
  log = [];
  store = new InMemoryStore(log);
  store.parcels.set(parcelHash, {
    ...referenceParcel,
    consignment: {
      ...referenceParcel.consignment,
      packageCount: 12,
      grossMassKg: "142.50",
      volumeCubicMeters: "0.85",
    },
    createdAt: "2026-09-20T08:15:00Z",
  });
});

describe("recordCargoEvent — HCS-first", () => {
  it("writes to Postgres only after consensus succeeds", async () => {
    const submitter = new ControlledSubmitter(log);
    const pending = recordCargoEvent({ parcelHash, event: referenceEvent }, { submitter, store });

    await vi.waitFor(() => expect(submitter.isPending).toBe(true));
    expect(store.events).toHaveLength(0);

    submitter.succeed();
    const recorded = await pending;

    expect(log).toEqual(["submit:start", "submit:ok", "store:write"]);
    expect(recorded.hcsSequenceNumber).toBe(1n);
    expect(recorded.payerAccountId).toBe("0.0.1001");
    expect(store.events).toEqual([recorded]);
  });

  it("writes nothing to Postgres when submission fails", async () => {
    const submitter = new InstantSubmitter(log, new Error("INVALID_SIGNATURE"));
    await expect(
      recordCargoEvent({ parcelHash, event: referenceEvent }, { submitter, store }),
    ).rejects.toThrow(SubmissionFailedError);
    expect(log).toEqual(["submit:start", "submit:fail"]);
    expect(store.events).toHaveLength(0);
  });

  it("submits only the blind envelope with the payloadHash of the normalized content", async () => {
    const submitter = new InstantSubmitter(log);
    await recordCargoEvent(
      { parcelHash, event: { ...referenceEvent, location: "  Kampala Hub, Uganda " } },
      { submitter, store },
    );

    const [message] = submitter.messages;
    expect(message).toBeDefined();
    const text = new TextDecoder().decode(message);
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["parcelHash", "payloadHash", "v"]);
    for (const leak of ["Kampala", "In Transit", "MTN", "MTNL", "2026-09-25"])
      expect(text).not.toContain(leak);
    expect(parseEnvelope(text)).toEqual({
      v: 1,
      parcelHash,
      payloadHash: await computePayloadHash(referenceEvent),
    });
  });

  it("stores the normalized content that was hashed", async () => {
    const submitter = new InstantSubmitter(log);
    const recorded = await recordCargoEvent(
      {
        parcelHash,
        event: { ...referenceEvent, carrier: { name: " MTN Logistics ", scacCode: "mtnl" } },
      },
      { submitter, store },
    );
    expect(recorded.event).toEqual({
      ...referenceEvent,
      carrier: { name: "MTN Logistics", scacCode: "MTNL" },
    });
  });

  it("rejects invalid content before touching the ledger or the database", async () => {
    const submitter = new InstantSubmitter(log);
    await expect(
      recordCargoEvent(
        { parcelHash, event: { ...referenceEvent, status: "" } },
        { submitter, store },
      ),
    ).rejects.toThrow(ValidationError);
    expect(log).toEqual([]);
  });

  it("rejects an unknown or malformed parcel before submitting", async () => {
    const submitter = new InstantSubmitter(log);
    await expect(
      recordCargoEvent({ parcelHash: "f".repeat(64), event: referenceEvent }, { submitter, store }),
    ).rejects.toThrow(ParcelNotFoundError);
    await expect(
      recordCargoEvent({ parcelHash: "nope", event: referenceEvent }, { submitter, store }),
    ).rejects.toThrow(ValidationError);
    expect(log).toEqual([]);
  });

  it("reports an anchored-but-not-cached event with its sequence number and content", async () => {
    store.failWritesWith = new Error("connection reset");
    const submitter = new InstantSubmitter(log);
    const error = await recordCargoEvent(
      { parcelHash, event: referenceEvent },
      { submitter, store },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DerivedWriteError);
    expect((error as DerivedWriteError).hcsSequenceNumber).toBe(1n);
    expect((error as DerivedWriteError).pending.event).toEqual(referenceEvent);
    expect(log).toEqual(["submit:start", "submit:ok", "store:write"]);
  });
});
