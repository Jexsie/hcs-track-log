import { beforeEach, describe, expect, it } from "vitest";
import { buildEnvelope, serializeEnvelope } from "@/lib/envelope/envelope";
import { computePayloadHash } from "@/lib/hashing/payload-hash";
import { createMirrorClient } from "@/lib/mirror/mirror-client";
import { FAKE_MIRROR, FAKE_TOPIC, FakeLedger } from "@/test/fake-ledger";
import { REFERENCE_PARCEL_SHA256, referenceEvent } from "@/test/fixtures/records";
import { verifyEvent } from "./verify-event";

const parcelHash = REFERENCE_PARCEL_SHA256;
let ledger: FakeLedger;
let mirror: ReturnType<typeof createMirrorClient>;

async function anchor(content: unknown, forParcel = parcelHash): Promise<bigint> {
  const payloadHash = await computePayloadHash(content);

  return (
    await ledger.submit(serializeEnvelope(buildEnvelope({ parcelHash: forParcel, payloadHash })))
  ).sequenceNumber;
}

beforeEach(() => {
  ledger = new FakeLedger();
  mirror = createMirrorClient({ baseUrl: FAKE_MIRROR, topicId: FAKE_TOPIC, fetch: ledger.fetch });
});

describe("verifyEvent — recompute, never retrieve", () => {
  it("verifies untouched content and reports the RECOMPUTED hash and a mirror link", async () => {
    const seq = await anchor(referenceEvent);
    const verdict = await verifyEvent(
      parcelHash,
      { hcsSequenceNumber: seq, content: referenceEvent },
      mirror,
    );

    expect(verdict).toMatchObject({
      status: "verified",
      sequenceNumber: seq,
      payloadHash: await computePayloadHash(referenceEvent),
      ledgerPayer: "0.0.1001",
      mirrorUrl: `${FAKE_MIRROR}/api/v1/topics/${FAKE_TOPIC}/messages/${seq}`,
    });
  });

  it("verifies content that differs only in representation (Date vs string, whitespace)", async () => {
    const seq = await anchor(referenceEvent);
    const fromDb = {
      ...referenceEvent,
      location: "Kampala Hub, Uganda ",
      timestamp: new Date("2026-09-25T11:40:00Z"),
    };

    expect(
      (await verifyEvent(parcelHash, { hcsSequenceNumber: seq, content: fromDb }, mirror)).status,
    ).toBe("verified");
  });

  it.each([
    ["location", { location: "Nairobi Depot, Kenya" }],
    ["status", { status: "Delivered" }],
    ["timestamp", { timestamp: "2026-09-25T11:40:01Z" }],
    ["carrier", { carrier: { name: "MTN Logistics", scacCode: "XXXX" } }],
  ])("flags a changed %s as TAMPERED with both hashes", async (_field, change) => {
    const seq = await anchor(referenceEvent);
    const tampered = { ...referenceEvent, ...change };
    const verdict = await verifyEvent(
      parcelHash,
      { hcsSequenceNumber: seq, content: tampered },
      mirror,
    );

    expect(verdict).toMatchObject({
      status: "tampered",
      reason: "content-mismatch",
      recomputedPayloadHash: await computePayloadHash(tampered),
      onChainPayloadHash: await computePayloadHash(referenceEvent),
    });
  });

  it("flags an event whose anchor belongs to another parcel", async () => {
    const seq = await anchor(referenceEvent, "f".repeat(64));
    const verdict = await verifyEvent(
      parcelHash,
      { hcsSequenceNumber: seq, content: referenceEvent },
      mirror,
    );

    expect(verdict).toMatchObject({ status: "tampered", reason: "wrong-parcel" });
  });

  it("flags content that no longer passes validation", async () => {
    const seq = await anchor(referenceEvent);
    const verdict = await verifyEvent(
      parcelHash,
      { hcsSequenceNumber: seq, content: { ...referenceEvent, status: "" } },
      mirror,
    );

    expect(verdict).toMatchObject({
      status: "tampered",
      reason: "invalid-content",
      recomputedPayloadHash: null,
    });
  });

  it("flags a sequence number whose message is not an envelope", async () => {
    ledger.append('{"hello":"world"}');
    const verdict = await verifyEvent(
      parcelHash,
      { hcsSequenceNumber: 1n, content: referenceEvent },
      mirror,
    );

    expect(verdict).toMatchObject({ status: "tampered", reason: "not-an-envelope" });
  });

  it("flags a sequence number with no ledger message at all", async () => {
    const verdict = await verifyEvent(
      parcelHash,
      { hcsSequenceNumber: 42n, content: referenceEvent },
      mirror,
    );

    expect(verdict).toMatchObject({ status: "tampered", reason: "no-anchor", sequenceNumber: 42n });
  });

  it("reports the mirror being unreachable as unavailable, not verified", async () => {
    const down = createMirrorClient({
      baseUrl: FAKE_MIRROR,
      topicId: FAKE_TOPIC,
      fetch: async () => new Response("", { status: 503 }),
    });
    const verdict = await verifyEvent(
      parcelHash,
      { hcsSequenceNumber: 1n, content: referenceEvent },
      down,
    );

    expect(verdict.status).toBe("unavailable");
  });
});
