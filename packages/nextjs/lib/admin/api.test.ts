import { describe, expect, it } from "vitest";
import { fetchParcelSummary, recordEvent, registerParcel } from "./api";

const TOKEN = "t".repeat(40);
const HASH = "a".repeat(64);

function recorder(response: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return response();
  };
  return { calls, fetchImpl };
}

describe("registerParcel", () => {
  it("POSTs JSON with the bearer token and returns the tracking ID", async () => {
    const { calls, fetchImpl } = recorder(() =>
      Response.json(
        { parcelHash: HASH, firstEvent: { hcsSequenceNumber: "7", payerAccountId: "0.0.1001" } },
        { status: 201 },
      ),
    );
    const result = await registerParcel(TOKEN, { parcel: {}, firstEvent: {} }, fetchImpl);
    expect(result).toEqual({
      ok: true,
      data: {
        parcelHash: HASH,
        firstEvent: { hcsSequenceNumber: "7", payerAccountId: "0.0.1001" },
      },
    });
    expect(calls[0]?.url).toBe("/api/parcels");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/json");
  });

  it("returns the API error (code, message, path)", async () => {
    const { fetchImpl } = recorder(() =>
      Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "carrier.scacCode must be 2–4 letters",
            path: "carrier.scacCode",
          },
        },
        { status: 400 },
      ),
    );
    expect(await registerParcel(TOKEN, {}, fetchImpl)).toEqual({
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "carrier.scacCode must be 2–4 letters",
      path: "carrier.scacCode",
    });
  });

  it("reports network failures and non-JSON responses", async () => {
    const down = await registerParcel(TOKEN, {}, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(down).toMatchObject({ ok: false, status: 0, code: "NETWORK_ERROR" });
    const html = await registerParcel(
      TOKEN,
      {},
      async () => new Response("<html>", { status: 502 }),
    );
    expect(html).toMatchObject({ ok: false, status: 502, code: "BAD_RESPONSE" });
  });
});

describe("recordEvent", () => {
  it("POSTs the tracking ID and event in the body to /api/events", async () => {
    const { calls, fetchImpl } = recorder(() =>
      Response.json({ parcelHash: HASH, hcsSequenceNumber: "8" }, { status: 201 }),
    );
    const result = await recordEvent(TOKEN, HASH, { status: "Delivered" }, fetchImpl);
    expect(result).toEqual({ ok: true, data: { parcelHash: HASH, hcsSequenceNumber: "8" } });
    expect(calls[0]?.url).toBe("/api/events");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      parcelHash: HASH,
      event: { status: "Delivered" },
    });
  });
});

describe("fetchParcelSummary", () => {
  it("summarizes the parcel and its latest event", async () => {
    const { fetchImpl } = recorder(() =>
      Response.json({
        parcelHash: HASH,
        parcel: { consignment: { description: "Coffee" } },
        events: [
          { hcsSequenceNumber: "1", content: { status: "Booked", location: "Mbale" } },
          { hcsSequenceNumber: "2", content: { status: "In Transit", location: "Kampala" } },
        ],
      }),
    );
    expect(await fetchParcelSummary(HASH, fetchImpl)).toEqual({
      ok: true,
      data: {
        description: "Coffee",
        eventCount: 2,
        latest: { status: "In Transit", location: "Kampala", hcsSequenceNumber: "2" },
      },
    });
  });

  it("passes through a 404", async () => {
    const { fetchImpl } = recorder(() =>
      Response.json({ error: { code: "PARCEL_NOT_FOUND", message: "no parcel" } }, { status: 404 }),
    );
    expect(await fetchParcelSummary(HASH, fetchImpl)).toMatchObject({
      ok: false,
      status: 404,
      code: "PARCEL_NOT_FOUND",
    });
  });
});
