import { describe, expect, it } from "vitest";
import { lookupTimeline } from "./lookup-client";

const HASH = "a".repeat(64);
const timeline = { parcelHash: HASH, parcel: {}, events: [] };

function recorder(response: () => Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });

    return response();
  };

  return { calls, fetchImpl };
}

describe("lookupTimeline", () => {
  it("POSTs the tracking ID in the JSON body, not the URL", async () => {
    const { calls, fetchImpl } = recorder(() => Response.json(timeline));

    expect(await lookupTimeline(HASH, fetchImpl)).toEqual({ status: "found", timeline });
    expect(calls[0]?.url).toBe("/api/parcels/lookup");
    expect(calls[0]?.url).not.toContain(HASH);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ trackingId: HASH });
    expect(calls[0]?.init?.cache).toBe("no-store");
  });

  it("maps 404 to not-found and other failures to error", async () => {
    expect(
      await lookupTimeline(
        HASH,
        recorder(() => Response.json({ error: { code: "PARCEL_NOT_FOUND" } }, { status: 404 }))
          .fetchImpl,
      ),
    ).toEqual({
      status: "not-found",
    });
    expect(
      (await lookupTimeline(HASH, recorder(() => new Response("x", { status: 500 })).fetchImpl))
        .status,
    ).toBe("error");
    const down = await lookupTimeline(HASH, async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(down.status).toBe("error");
  });
});
