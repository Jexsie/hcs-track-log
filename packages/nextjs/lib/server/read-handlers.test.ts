import { describe, expect, it } from "vitest";
import type { StoredEvent, StoredParcel } from "@/lib/db/rows";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { getTimelineResponse, type TimelineReader } from "./read-handlers";

const hash = "b".repeat(64);
const reader = (found: boolean): TimelineReader => ({
  findParcel: async (h): Promise<StoredParcel | null> =>
    found && h === hash ? { parcelHash: hash, content: referenceParcel } : null,
  listEvents: async (): Promise<StoredEvent[]> => [
    {
      id: "e1",
      parcelHash: hash,
      hcsSequenceNumber: 1n,
      payerAccountId: "0.0.1001",
      recordedAt: new Date(0),
      content: referenceEvent,
    },
  ],
});

describe("GET /api/parcels/:parcelHash", () => {
  it("returns the stored timeline (tracking ID normalized from user input)", async () => {
    const res = await getTimelineResponse(reader(true), ` 0x${hash.toUpperCase()} `);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      parcelHash: string;
      events: { hcsSequenceNumber: string }[];
    };
    expect(body.parcelHash).toBe(hash);
    expect(body.events[0]?.hcsSequenceNumber).toBe("1");
  });

  it("returns 404 for an unknown parcel and 400 for a malformed ID", async () => {
    expect((await getTimelineResponse(reader(false), hash)).status).toBe(404);
    expect((await getTimelineResponse(reader(true), "nope")).status).toBe(400);
  });

  it("returns 500 without details when the database fails", async () => {
    const broken: TimelineReader = {
      findParcel: () => Promise.reject(new Error("ECONNREFUSED secret-host")),
      listEvents: async () => [],
    };
    const res = await getTimelineResponse(broken, hash, () => {});
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret-host");
  });
});
