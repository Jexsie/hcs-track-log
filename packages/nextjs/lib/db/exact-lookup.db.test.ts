import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lookupTimelineResponse } from "@/lib/server/read-handlers";
import { createTestPool, truncateAll } from "@/test/db/database";
import { parcelFixture, recordedEvent } from "@/test/fixtures/parcels";
import { PostgresTrackingReader } from "./tracking-reader";
import { PostgresTrackingStore } from "./tracking-store";

/** The database answers only exact tracking IDs: no prefix, case-folding, LIKE or fuzzy search. */
const pool = createTestPool();
const reader = new PostgresTrackingReader(pool);
let parcelHash: string;

beforeAll(async () => {
  await truncateAll(pool);
  const fixture = await parcelFixture();

  parcelHash = fixture.parcelHash;
  await new PostgresTrackingStore(pool).insertParcelWithFirstEvent(
    fixture.parcel,
    recordedEvent(parcelHash, 1n),
  );
});
afterAll(() => pool.end());

const post = (trackingId: string) =>
  new Request("http://localhost/api/parcels/lookup", {
    method: "POST",
    body: JSON.stringify({ trackingId }),
  });

describe("exact-match lookup against Postgres", () => {
  it("finds the parcel only by its exact tracking ID", async () => {
    expect((await reader.findParcel(parcelHash))?.parcelHash).toBe(parcelHash);
    expect((await lookupTimelineResponse(reader, post(parcelHash))).status).toBe(200);
  });

  it.each([
    ["upper case", () => parcelHash.toUpperCase()],
    ["prefix", () => parcelHash.slice(0, 63)],
    ["LIKE wildcard", () => `${parcelHash.slice(0, 63)}%`],
    ["single-char wildcard", () => `${parcelHash.slice(0, 63)}_`],
    ["regex-ish", () => ".*"],
  ])("returns nothing for %s, at the reader and at the API", async (_label, variant) => {
    expect(await reader.findParcel(variant())).toBeNull();
    expect((await lookupTimelineResponse(reader, post(variant()))).status).toBe(404);
  });
});
