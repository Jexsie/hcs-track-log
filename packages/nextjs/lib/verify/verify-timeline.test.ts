import { describe, expect, it } from "vitest";
import { buildEnvelope, serializeEnvelope } from "@/lib/envelope/envelope";
import { computeParcelHash } from "@/lib/hashing/parcel-hash";
import { computePayloadHash } from "@/lib/hashing/payload-hash";
import { createMirrorClient } from "@/lib/mirror/mirror-client";
import { FAKE_MIRROR, FAKE_TOPIC, FakeLedger } from "@/test/fake-ledger";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { verifyParcelContent, verifyTimeline } from "./verify-timeline";

describe("verifyParcelContent", () => {
  it("recomputes the tracking ID from content", async () => {
    const parcelHash = await computeParcelHash(referenceParcel);
    expect(await verifyParcelContent(parcelHash, referenceParcel)).toEqual({
      status: "verified",
      parcelHash,
    });
  });

  it("flags edited parcel content", async () => {
    const parcelHash = await computeParcelHash(referenceParcel);
    const edited = {
      ...referenceParcel,
      consignment: { ...referenceParcel.consignment, grossMassKg: "99.00" },
    };
    expect(await verifyParcelContent(parcelHash, edited)).toMatchObject({
      status: "tampered",
      reason: "content-mismatch",
      recomputedParcelHash: await computeParcelHash(edited),
    });
    expect(
      await verifyParcelContent(parcelHash, { ...referenceParcel, bookingRef: "" }),
    ).toMatchObject({
      status: "tampered",
      reason: "invalid-content",
    });
  });
});

describe("verifyTimeline", () => {
  it("verifies every event, reports progress per event and summarizes", async () => {
    const ledger = new FakeLedger();
    const mirror = createMirrorClient({
      baseUrl: FAKE_MIRROR,
      topicId: FAKE_TOPIC,
      fetch: ledger.fetch,
    });
    const parcelHash = await computeParcelHash(referenceParcel);
    const contents = ["Booked", "In Transit", "Delivered"].map((status) => ({
      ...referenceEvent,
      status,
    }));
    const events = [];
    for (const content of contents) {
      const payloadHash = await computePayloadHash(content);
      const { sequenceNumber } = await ledger.submit(
        serializeEnvelope(buildEnvelope({ parcelHash, payloadHash })),
      );
      events.push({ hcsSequenceNumber: sequenceNumber, content });
    }
    const second = events[1];
    if (second) second.content = { ...second.content, location: "Elsewhere" };

    const progress: bigint[] = [];
    const report = await verifyTimeline({
      parcelHash,
      parcel: referenceParcel,
      events,
      mirror,
      concurrency: 2,
      onEvent: (v) => progress.push(v.sequenceNumber),
    });

    expect(report.parcel.status).toBe("verified");
    expect(report.events.map((v) => v.status)).toEqual(["verified", "tampered", "verified"]);
    expect(report.summary).toEqual({ verified: 2, tampered: 1, unavailable: 0 });
    expect([...progress].sort()).toEqual([1n, 2n, 3n]);
  });
});
