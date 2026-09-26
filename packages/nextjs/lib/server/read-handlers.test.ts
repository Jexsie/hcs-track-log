import { describe, expect, it } from "vitest";
import type { StoredEvent, StoredParcel } from "@/lib/db/rows";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { type TimelineReader, lookupTimelineResponse } from "./read-handlers";

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

const lookup = (body: unknown) =>
  new Request("http://localhost/api/parcels/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/parcels/lookup (tracking ID in the body, never the URL)", () => {
  it("returns the stored timeline for an exact match, uncacheable", async () => {
    const res = await lookupTimelineResponse(reader(true), lookup({ trackingId: hash }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as {
      parcelHash: string;
      events: { hcsSequenceNumber: string }[];
    };
    expect(body.parcelHash).toBe(hash);
    expect(body.events[0]?.hcsSequenceNumber).toBe("1");
  });

  it.each([
    ["an unknown ID", "c".repeat(64)],
    ["upper case", hash.toUpperCase()],
    ["0x prefix", `0x${hash}`],
    ["a prefix", hash.slice(0, 40)],
    ["garbage", "nope"],
  ])("returns the same 404 for %s", async (_label, trackingId) => {
    const res = await lookupTimelineResponse(reader(true), lookup({ trackingId }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PARCEL_NOT_FOUND");
  });

  it("returns 400 for a body without a string trackingId", async () => {
    for (const body of ["{oops", {}, { trackingId: 42 }, []]) {
      expect((await lookupTimelineResponse(reader(true), lookup(body))).status).toBe(400);
    }
  });

  it("returns 500 without details when the database fails", async () => {
    const broken: TimelineReader = {
      findParcel: () => Promise.reject(new Error("ECONNREFUSED secret-host")),
      listEvents: async () => [],
    };
    const res = await lookupTimelineResponse(broken, lookup({ trackingId: hash }), () => {});
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret-host");
  });
});
