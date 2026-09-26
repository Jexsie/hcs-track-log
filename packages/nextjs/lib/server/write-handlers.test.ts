import { beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "@/lib/config/env";
import type { EnvelopeSubmitter } from "@/lib/tracking/ports";
import { type Effect, InMemoryStore, InstantSubmitter } from "@/test/fakes";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { createWriteHandlers } from "./write-handlers";

const TOKEN = "s".repeat(48);
const { createdAt: _createdAt, ...parcelForm } = referenceParcel;

let log: Effect[];
let store: InMemoryStore;
let submitterRequests: number;

function handlers(
  getSubmitter: () => Promise<EnvelopeSubmitter> = async () => new InstantSubmitter(log),
) {
  return createWriteHandlers({
    store,
    getSubmitter: () => {
      submitterRequests++;
      return getSubmitter();
    },
    apiToken: () => TOKEN,
    log: () => {},
  });
}

const post = (body: unknown, token: string | null = TOKEN) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  log = [];
  store = new InMemoryStore(log);
  submitterRequests = 0;
});

describe("registerParcel handler", () => {
  it("registers HCS-first and returns 201 with the tracking ID", async () => {
    const res = await handlers().registerParcel(
      post({ parcel: parcelForm, firstEvent: referenceEvent }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      parcelHash: string;
      firstEvent: { hcsSequenceNumber: string };
    };
    expect(body.parcelHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.firstEvent.hcsSequenceNumber).toBe("1");
    expect(log).toEqual(["submit:start", "submit:ok", "store:write"]);
  });

  it("returns 401 without the bearer token and never reaches the ledger", async () => {
    const res = await handlers().registerParcel(
      post({ parcel: parcelForm, firstEvent: referenceEvent }, null),
    );
    expect(res.status).toBe(401);
    expect(submitterRequests).toBe(0);
    expect(log).toEqual([]);
  });

  it("returns 400 for malformed JSON or invalid content without initializing the submitter", async () => {
    expect((await handlers().registerParcel(post("{nope"))).status).toBe(400);
    const res = await handlers().registerParcel(
      post({ parcel: parcelForm, firstEvent: { ...referenceEvent, status: "" } }),
    );
    expect(res.status).toBe(400);
    expect(submitterRequests).toBe(0);
  });

  it("returns 500 SERVER_MISCONFIGURED when the submitter cannot be built, and writes nothing", async () => {
    const res = await handlers(async () => {
      throw new ConfigError("HCS_TOPIC_ID is not set");
    }).registerParcel(post({ parcel: parcelForm, firstEvent: referenceEvent }));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "SERVER_MISCONFIGURED",
    );
    expect(store.parcels.size).toBe(0);
  });
});

describe("recordEvent handler", () => {
  it("appends an event and returns 201 with its sequence number", async () => {
    const created = await handlers().registerParcel(
      post({ parcel: parcelForm, firstEvent: referenceEvent }),
    );
    const { parcelHash } = (await created.json()) as { parcelHash: string };

    const res = await handlers().recordEvent(
      post({ parcelHash, event: { ...referenceEvent, status: "Delivered" } }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ parcelHash, hcsSequenceNumber: "1" });
    expect(store.events.map((e) => e.event.status)).toEqual(["In Transit", "Delivered"]);
  });

  it("returns 404 for an unknown parcel and 502 when the ledger rejects the event", async () => {
    expect(
      (await handlers().recordEvent(post({ parcelHash: "c".repeat(64), event: referenceEvent })))
        .status,
    ).toBe(404);

    const created = await handlers().registerParcel(
      post({ parcel: parcelForm, firstEvent: referenceEvent }),
    );
    const { parcelHash } = (await created.json()) as { parcelHash: string };
    const res = await handlers(
      async () => new InstantSubmitter(log, new Error("INVALID_SIGNATURE")),
    ).recordEvent(post({ parcelHash, event: referenceEvent }));
    expect(res.status).toBe(502);
    expect(store.events).toHaveLength(1);
  });
});
