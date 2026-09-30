import { describe, expect, it } from "vitest";
import {
  createSession,
  fetchParcelSummary,
  finalizeSubmission,
  getSession,
  listSubmissions,
  proposeEvent,
  proposeRegistration,
  requestChallenge,
  signOut,
} from "./api";

const HASH = "a".repeat(64);

function recorder(response: () => Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });

    return response();
  };

  return { calls, fetchImpl };
}

const header = (init: RequestInit | undefined, name: string) =>
  new Headers(init?.headers).get(name);

describe("admin API client (cookie session, JSON bodies, no IDs in URLs)", () => {
  it.each([
    [
      "requestChallenge",
      (f: typeof fetch) => requestChallenge("0.0.100", f),
      "/api/admin/auth/challenge",
      "POST",
      { accountId: "0.0.100" },
    ],
    [
      "createSession",
      (f: typeof fetch) =>
        createSession({ accountId: "0.0.100", token: "t", signatureMap: "s" }, f),
      "/api/admin/auth/session",
      "POST",
      { accountId: "0.0.100", token: "t", signatureMap: "s" },
    ],
    [
      "proposeRegistration",
      (f: typeof fetch) => proposeRegistration({ parcel: { a: 1 }, firstEvent: { b: 2 } }, f),
      "/api/admin/submissions",
      "POST",
      { kind: "register-parcel", parcel: { a: 1 }, firstEvent: { b: 2 } },
    ],
    [
      "proposeEvent",
      (f: typeof fetch) => proposeEvent({ parcelHash: HASH, event: { b: 2 } }, f),
      "/api/admin/submissions",
      "POST",
      { kind: "record-event", parcelHash: HASH, event: { b: 2 } },
    ],
    [
      "finalizeSubmission",
      (f: typeof fetch) => finalizeSubmission("id-1", f),
      "/api/admin/submissions/finalize",
      "POST",
      { id: "id-1" },
    ],
  ] as const)("%s POSTs JSON to its endpoint", async (_name, call, url, method, body) => {
    const { calls, fetchImpl } = recorder(() => Response.json({ ok: true }));

    await call(fetchImpl);
    expect(calls[0]?.url).toBe(url);
    expect(calls[0]?.init?.method).toBe(method);
    expect(header(calls[0]?.init, "content-type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(body);
    expect(calls[0]?.init?.credentials).toBe("same-origin");
    expect(header(calls[0]?.init, "authorization")).toBeNull();
  });

  it("reads and ends the session with GET / DELETE", async () => {
    const { calls, fetchImpl } = recorder(() => Response.json({ accountId: "0.0.100" }));

    expect(await getSession(fetchImpl)).toEqual({ ok: true, data: { accountId: "0.0.100" } });
    await signOut(fetchImpl);
    expect(calls.map((c) => [c.url, c.init?.method])).toEqual([
      ["/api/admin/auth/session", "GET"],
      ["/api/admin/auth/session", "DELETE"],
    ]);
  });

  it("lists submissions", async () => {
    const { calls, fetchImpl } = recorder(() => Response.json({ submissions: [] }));

    expect(await listSubmissions(fetchImpl)).toEqual({ ok: true, data: { submissions: [] } });
    expect(calls[0]?.init?.method).toBe("GET");
  });

  it("returns API errors with code, message and path, and network failures", async () => {
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

    expect(await proposeEvent({ parcelHash: HASH, event: {} }, fetchImpl)).toEqual({
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "carrier.scacCode must be 2–4 letters",
      path: "carrier.scacCode",
    });
    const down = await getSession(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(down).toMatchObject({ ok: false, status: 0, code: "NETWORK_ERROR" });
  });
});

describe("fetchParcelSummary", () => {
  it("summarizes the parcel and its latest event via the body-based lookup", async () => {
    const { calls, fetchImpl } = recorder(() =>
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
    expect(calls[0]?.url).toBe("/api/parcels/lookup");
  });
});
