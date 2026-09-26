import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresTrackingReader } from "@/lib/db/tracking-reader";
import { PostgresTrackingStore } from "@/lib/db/tracking-store";
import { buildEnvelope, serializeEnvelope } from "@/lib/envelope/envelope";
import { createMirrorClient } from "@/lib/mirror/mirror-client";
import { recordCargoEvent } from "@/lib/tracking/record-event";
import { registerParcel } from "@/lib/tracking/register-parcel";
import { createTestPool, truncateAll } from "@/test/db/database";
import { FAKE_MIRROR, FAKE_TOPIC, FakeLedger } from "@/test/fake-ledger";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { verifyTopic } from "./verify-topic";

const pool = createTestPool();
const store = new PostgresTrackingStore(pool);
const reader = new PostgresTrackingReader(pool);
afterAll(() => pool.end());
beforeEach(() => truncateAll(pool));

const { createdAt: _createdAt, ...parcelForm } = referenceParcel;

describe("verifyTopic (npm run verify)", () => {
  it("verifies every cached parcel, flags tampering, and finds ledger messages missing from the cache", async () => {
    const ledger = new FakeLedger();
    ledger.pageSize = 2; // force pagination over the topic
    const a = await registerParcel(
      { parcel: parcelForm, firstEvent: referenceEvent },
      { submitter: ledger, store },
    );
    await recordCargoEvent(
      { parcelHash: a.parcelHash, event: { ...referenceEvent, status: "Delivered" } },
      { submitter: ledger, store },
    );
    const b = await registerParcel(
      { parcel: { ...parcelForm, bookingRef: "BK-B" }, firstEvent: referenceEvent },
      { submitter: ledger, store },
    );
    // Anchored on the ledger but never cached (e.g. a DerivedWriteError), plus a foreign message.
    await ledger.submit(
      serializeEnvelope(buildEnvelope({ parcelHash: b.parcelHash, payloadHash: "c".repeat(64) })),
    );
    ledger.append("not an envelope");

    await pool.query("UPDATE cargo_events SET location = 'Tampered' WHERE hcs_sequence_number = 2");

    const report = await verifyTopic({
      reader,
      mirror: createMirrorClient({
        baseUrl: FAKE_MIRROR,
        topicId: FAKE_TOPIC,
        fetch: ledger.fetch,
      }),
    });

    expect(report.totals).toEqual({
      parcels: 2,
      verified: 2,
      tampered: 1,
      unavailable: 0,
      tamperedParcels: 0,
    });
    expect(report.uncached).toEqual([4n]);
    expect(report.foreign).toEqual([5n]);
    const tampered = report.parcels
      .flatMap((p) => p.report.events)
      .filter((e) => e.status === "tampered");
    expect(tampered.map((e) => e.sequenceNumber)).toEqual([2n]);
  });

  it("skips the topic scan on request", async () => {
    const ledger = new FakeLedger();
    await registerParcel(
      { parcel: parcelForm, firstEvent: referenceEvent },
      { submitter: ledger, store },
    );
    ledger.append("not an envelope");
    const report = await verifyTopic({
      reader,
      mirror: createMirrorClient({
        baseUrl: FAKE_MIRROR,
        topicId: FAKE_TOPIC,
        fetch: ledger.fetch,
      }),
      scanLedger: false,
    });
    expect(report.totals.verified).toBe(1);
    expect(report.foreign).toEqual([]);
    expect(ledger.requests.some((r) => r.includes("?"))).toBe(false);
  });

  it("can be limited to one parcel", async () => {
    const ledger = new FakeLedger();
    const a = await registerParcel(
      { parcel: parcelForm, firstEvent: referenceEvent },
      { submitter: ledger, store },
    );
    await registerParcel(
      { parcel: { ...parcelForm, bookingRef: "BK-B" }, firstEvent: referenceEvent },
      { submitter: ledger, store },
    );
    const report = await verifyTopic({
      reader,
      mirror: createMirrorClient({
        baseUrl: FAKE_MIRROR,
        topicId: FAKE_TOPIC,
        fetch: ledger.fetch,
      }),
      parcelHash: a.parcelHash,
    });
    expect(report.parcels.map((p) => p.parcelHash)).toEqual([a.parcelHash]);
    expect(report.uncached).toEqual([]);
  });
});
