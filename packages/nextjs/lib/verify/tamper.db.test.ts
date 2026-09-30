/**
 * HEADLINE TEST. Record events HCS-first, then alter a content field directly in Postgres
 * (an event's location, not its status) and prove the verifier reports TAMPERED because the hash
 * recomputed from the altered row no longer matches the on-chain anchor, while untouched events
 * still verify.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresTrackingReader } from "@/lib/db/tracking-reader";
import { PostgresTrackingStore } from "@/lib/db/tracking-store";
import { createMirrorClient } from "@/lib/mirror/mirror-client";
import { recordCargoEvent } from "@/lib/tracking/record-event";
import { registerParcel } from "@/lib/tracking/register-parcel";
import { createTestPool, truncateAll } from "@/test/db/database";
import { FAKE_MIRROR, FAKE_TOPIC, FakeLedger } from "@/test/fake-ledger";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { verifyTimeline } from "./verify-timeline";

const pool = createTestPool();
const store = new PostgresTrackingStore(pool);
const reader = new PostgresTrackingReader(pool);

afterAll(() => pool.end());

const { createdAt: _createdAt, ...parcelForm } = referenceParcel;
const JOURNEY = [
  { status: "Booked", location: "Mbale, Uganda", timestamp: "2026-09-24T08:00:00Z" },
  { status: "In Transit", location: "Kampala Hub, Uganda", timestamp: "2026-09-25T11:40:00Z" },
  { status: "At Hub", location: "Mombasa Port, Kenya", timestamp: "2026-09-26T06:00:00Z" },
];

let ledger: FakeLedger;
let parcelHash: string;

async function verifyFromPostgres() {
  const parcel = await reader.findParcel(parcelHash);

  if (!parcel) throw new Error("parcel missing");
  const events = await reader.listEvents(parcelHash);

  return verifyTimeline({
    parcelHash,
    parcel: parcel.content,
    events,
    mirror: createMirrorClient({ baseUrl: FAKE_MIRROR, topicId: FAKE_TOPIC, fetch: ledger.fetch }),
  });
}

beforeEach(async () => {
  await truncateAll(pool);
  ledger = new FakeLedger();
  const [first, ...rest] = JOURNEY.map((j) => ({ ...referenceEvent, ...j }));

  ({ parcelHash } = await registerParcel(
    { parcel: parcelForm, firstEvent: first },
    { submitter: ledger, store },
  ));

  for (const event of rest) {
    await recordCargoEvent({ parcelHash, event }, { submitter: ledger, store });
  }
});

describe("tamper detection via recomputation", () => {
  it("verifies every event of an untouched parcel", async () => {
    const report = await verifyFromPostgres();

    expect(report.parcel.status).toBe("verified");
    expect(report.events.map((e) => e.status)).toEqual(["verified", "verified", "verified"]);
  });

  it("reports TAMPERED when an event's location is edited in Postgres; untouched events still verify", async () => {
    const edit = await pool.query(
      "UPDATE cargo_events SET location = 'Nairobi Depot, Kenya' WHERE hcs_sequence_number = 2",
    );

    expect(edit.rowCount).toBe(1);

    const report = await verifyFromPostgres();
    const [one, two, three] = report.events;

    expect(one?.status).toBe("verified");
    expect(three?.status).toBe("verified");
    expect(two).toMatchObject({
      status: "tampered",
      reason: "content-mismatch",
      sequenceNumber: 2n,
    });
    if (two?.status !== "tampered") throw new Error("unreachable");
    expect(two.recomputedPayloadHash).not.toBe(two.onChainPayloadHash);
    expect(report.parcel.status).toBe("verified");
    expect(report.summary).toEqual({ verified: 2, tampered: 1, unavailable: 0 });
  });

  it("reports the parcel as TAMPERED when immutable parcel content is edited", async () => {
    await pool.query("UPDATE parcels SET gross_mass_kg = 99.00 WHERE parcel_hash = $1", [
      parcelHash,
    ]);
    const report = await verifyFromPostgres();

    expect(report.parcel).toMatchObject({ status: "tampered", reason: "content-mismatch" });
    expect(report.events.every((e) => e.status === "verified")).toBe(true);
  });

  it("reports TAMPERED when a row is pointed at a different ledger message", async () => {
    await pool.query(
      "UPDATE cargo_events SET hcs_sequence_number = 99 WHERE hcs_sequence_number = 3",
    );
    const report = await verifyFromPostgres();

    expect(report.events[2]).toMatchObject({
      status: "tampered",
      reason: "no-anchor",
      sequenceNumber: 99n,
    });
  });

  it("reports TAMPERED for a fabricated row with no anchor", async () => {
    await pool.query(
      `INSERT INTO cargo_events (parcel_hash, status, location, carrier_name, carrier_scac_code,
                                 event_timestamp, payer_account_id, hcs_sequence_number)
       VALUES ($1, 'Delivered', 'Hamburg, Germany', 'MTN Logistics', 'MTNL', '2026-09-27T09:00:00Z', '0.0.1001', 4)`,
      [parcelHash],
    );
    const report = await verifyFromPostgres();

    expect(report.events[3]).toMatchObject({ status: "tampered", reason: "no-anchor" });
  });
});
