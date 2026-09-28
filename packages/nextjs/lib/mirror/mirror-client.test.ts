import { describe, expect, it } from "vitest";
import { FAKE_MIRROR, FAKE_TOPIC, FakeLedger } from "@/test/fake-ledger";
import { MirrorNotFoundError, MirrorRequestError } from "./http";
import { createMirrorClient } from "./mirror-client";

const encode = (s: string) => new TextEncoder().encode(s);

function ledgerWith(count: number): FakeLedger {
  const ledger = new FakeLedger();
  for (let i = 1; i <= count; i++) ledger.append(`message-${i}`);
  return ledger;
}

describe("getMessage", () => {
  it("fetches one message by sequence number and decodes the base64 payload", async () => {
    const ledger = ledgerWith(3);
    const mirror = createMirrorClient({
      baseUrl: FAKE_MIRROR,
      topicId: FAKE_TOPIC,
      fetch: ledger.fetch,
    });
    const msg = await mirror.getMessage(2n);
    expect(ledger.requests).toEqual([`/api/v1/topics/${FAKE_TOPIC}/messages/2`]);
    expect(msg).toMatchObject({
      topicId: FAKE_TOPIC,
      sequenceNumber: 2n,
      payerAccountId: "0.0.666",
    });
    expect(msg.message).toEqual(encode("message-2"));
  });

  it("decodes non-ASCII payloads byte-exactly", async () => {
    const ledger = new FakeLedger();
    ledger.append("Café ✓");
    const mirror = createMirrorClient({
      baseUrl: FAKE_MIRROR,
      topicId: FAKE_TOPIC,
      fetch: ledger.fetch,
    });
    expect(new TextDecoder().decode((await mirror.getMessage(1n)).message)).toBe("Café ✓");
  });

  it("raises MirrorNotFoundError for a sequence number with no message", async () => {
    const mirror = createMirrorClient({
      baseUrl: FAKE_MIRROR,
      topicId: FAKE_TOPIC,
      fetch: ledgerWith(1).fetch,
    });
    await expect(mirror.getMessage(9n)).rejects.toThrow(MirrorNotFoundError);
  });

  it("raises MirrorRequestError on server errors, network errors and malformed bodies", async () => {
    const cases: (typeof fetch)[] = [
      async () => new Response("down", { status: 503 }),
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => Response.json({ sequence_number: 1 }),
      async () => Response.json({ ...validBody(), topic_id: "0.0.9999" }),
      async () => new Response("<html>", { status: 200 }),
    ];
    for (const fetchImpl of cases) {
      const mirror = createMirrorClient({
        baseUrl: FAKE_MIRROR,
        topicId: FAKE_TOPIC,
        fetch: fetchImpl,
      });
      await expect(mirror.getMessage(1n)).rejects.toThrow(MirrorRequestError);
    }
  });

  it("builds the public message URL (trailing slash tolerated)", () => {
    const mirror = createMirrorClient({ baseUrl: `${FAKE_MIRROR}/`, topicId: FAKE_TOPIC });
    expect(mirror.messageUrl(7n)).toBe(`${FAKE_MIRROR}/api/v1/topics/${FAKE_TOPIC}/messages/7`);
  });
});

describe("getMessageAt", () => {
  it("finds the message with an exact consensus timestamp", async () => {
    const ledger = ledgerWith(3);
    const mirror = createMirrorClient({
      baseUrl: FAKE_MIRROR,
      topicId: FAKE_TOPIC,
      fetch: ledger.fetch,
    });
    const at = ledger.entries[1]?.consensusTimestamp ?? "";
    expect((await mirror.getMessageAt(at))?.sequenceNumber).toBe(2n);
    expect(ledger.requests.at(-1)).toBe(
      `/api/v1/topics/${FAKE_TOPIC}/messages?timestamp=eq:${at}&limit=1`,
    );
    expect(await mirror.getMessageAt("1.000000001")).toBeNull();
  });
});

describe("listMessages (pagination)", () => {
  it("follows links.next across pages until it is null", async () => {
    const ledger = ledgerWith(5); // page size 2 → 3 pages
    const mirror = createMirrorClient({
      baseUrl: FAKE_MIRROR,
      topicId: FAKE_TOPIC,
      fetch: ledger.fetch,
    });
    const seqs: bigint[] = [];
    for await (const m of mirror.listMessages({ limit: 2 })) seqs.push(m.sequenceNumber);
    expect(seqs).toEqual([1n, 2n, 3n, 4n, 5n]);
    expect(ledger.requests).toHaveLength(3);
    expect(ledger.requests[0]).toBe(`/api/v1/topics/${FAKE_TOPIC}/messages?limit=2&order=asc`);
  });

  it("yields nothing for an empty topic", async () => {
    const mirror = createMirrorClient({
      baseUrl: FAKE_MIRROR,
      topicId: FAKE_TOPIC,
      fetch: ledgerWith(0).fetch,
    });
    const all = [];
    for await (const m of mirror.listMessages()) all.push(m);
    expect(all).toEqual([]);
  });

  it("refuses a next link that points at another host", async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json({
        messages: [validBody()],
        links: { next: "https://evil.test/api/v1/topics/0.0.5005/messages" },
      });
    const mirror = createMirrorClient({
      baseUrl: FAKE_MIRROR,
      topicId: FAKE_TOPIC,
      fetch: fetchImpl,
    });
    const iterate = async () => {
      for await (const _ of mirror.listMessages()) {
        /* drain */
      }
    };
    await expect(iterate()).rejects.toThrow("another origin");
  });
});

function validBody() {
  return {
    consensus_timestamp: "1758800400.000000001",
    message: Buffer.from("x").toString("base64"),
    payer_account_id: "0.0.1001",
    sequence_number: 1,
    topic_id: FAKE_TOPIC,
  };
}
