import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPool, truncateAll } from "@/test/db/database";
import { parcelFixture, recordedEvent } from "@/test/fixtures/parcels";
import { PostgresTrackingReader } from "./tracking-reader";
import { PostgresTrackingStore } from "./tracking-store";

const pool = createTestPool();
const store = new PostgresTrackingStore(pool);
const reader = new PostgresTrackingReader(pool);

afterAll(() => pool.end());
beforeEach(() => truncateAll(pool));

describe("PostgresTrackingStore", () => {
  it("inserts a parcel with its first event and reports it as existing", async () => {
    const { parcel, parcelHash } = await parcelFixture();

    expect(await store.parcelExists(parcelHash)).toBe(false);

    await store.insertParcelWithFirstEvent(parcel, recordedEvent(parcelHash, 7n));

    expect(await store.parcelExists(parcelHash)).toBe(true);
    const events = await reader.listEvents(parcelHash);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      parcelHash,
      hcsSequenceNumber: 7n,
      payerAccountId: "0.0.1001",
    });
  });

  it("is atomic: if the first event cannot be inserted, the parcel is not inserted either", async () => {
    const a = await parcelFixture();
    const b = await parcelFixture({ bookingRef: "BK-OTHER" });

    await store.insertParcelWithFirstEvent(a.parcel, recordedEvent(a.parcelHash, 1n));

    await expect(
      store.insertParcelWithFirstEvent(b.parcel, recordedEvent(b.parcelHash, 1n)),
    ).rejects.toThrow(/hcs_sequence_number/);
    expect(await store.parcelExists(b.parcelHash)).toBe(false);
  });

  it("appends events and lists them in ledger order", async () => {
    const { parcel, parcelHash } = await parcelFixture();

    await store.insertParcelWithFirstEvent(
      parcel,
      recordedEvent(parcelHash, 10n, { status: "Booked" }),
    );
    await store.insertEvent(recordedEvent(parcelHash, 30n, { status: "Delivered" }));
    await store.insertEvent(recordedEvent(parcelHash, 20n, { status: "In Transit" }));

    const events = await reader.listEvents(parcelHash);

    expect(events.map((e) => [e.hcsSequenceNumber, e.content.status])).toEqual([
      [10n, "Booked"],
      [20n, "In Transit"],
      [30n, "Delivered"],
    ]);
  });

  it("rejects an event for an unknown parcel and a reused sequence number", async () => {
    const { parcel, parcelHash } = await parcelFixture();

    await expect(store.insertEvent(recordedEvent(parcelHash, 1n))).rejects.toThrow(/foreign key/);
    await store.insertParcelWithFirstEvent(parcel, recordedEvent(parcelHash, 1n));
    await expect(store.insertEvent(recordedEvent(parcelHash, 1n))).rejects.toThrow(
      /hcs_sequence_number/,
    );
  });

  it("cascades event deletion with the parcel", async () => {
    const { parcel, parcelHash } = await parcelFixture();

    await store.insertParcelWithFirstEvent(parcel, recordedEvent(parcelHash, 1n));
    await pool.query("DELETE FROM parcels WHERE parcel_hash = $1", [parcelHash]);
    expect(await reader.listEvents(parcelHash)).toEqual([]);
  });

  it("returns null for an unknown parcel", async () => {
    expect(await reader.findParcel("0".repeat(64))).toBeNull();
  });
});
