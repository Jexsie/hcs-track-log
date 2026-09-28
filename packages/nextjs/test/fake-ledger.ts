import type { EnvelopeSubmitter, SubmissionReceipt } from "@/lib/tracking/ports";

export const FAKE_MIRROR = "https://mirror.test";
export const FAKE_TOPIC = "0.0.5005";

interface LedgerEntry {
  message: Uint8Array;
  consensusTimestamp: string;
  payer: string;
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/**
 * An in-memory HCS topic: accepts submissions like the network and serves them back over HTTP in
 * the mirror node's exact JSON shape (base64 messages, relative `links.next` pagination).
 */
export class FakeLedger implements EnvelopeSubmitter {
  readonly entries: LedgerEntry[] = [];
  readonly requests: string[] = [];
  pageSize = 2;

  async submit(message: Uint8Array): Promise<SubmissionReceipt> {
    const sequenceNumber = BigInt(this.entries.length + 1);
    this.entries.push({
      message,
      consensusTimestamp: `1758800${400 + this.entries.length}.000000001`,
      payer: "0.0.1001",
    });
    return {
      sequenceNumber,
      transactionId: `0.0.1001@1758800400.${sequenceNumber}`,
      payerAccountId: "0.0.1001",
    };
  }

  /** Put an arbitrary message on the topic (e.g. something that is not an envelope). */
  append(text: string): void {
    this.entries.push({
      message: new TextEncoder().encode(text),
      consensusTimestamp: `1758809${String(this.entries.length).padStart(3, "0")}.000000001`,
      payer: "0.0.666",
    });
  }

  private json(seq: number, entry: LedgerEntry) {
    return {
      chunk_info: { number: 1, total: 1 },
      consensus_timestamp: entry.consensusTimestamp,
      message: toBase64(entry.message),
      payer_account_id: entry.payer,
      running_hash: "AAAA",
      running_hash_version: 3,
      sequence_number: seq,
      topic_id: FAKE_TOPIC,
    };
  }

  readonly fetch: typeof fetch = async (input) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    this.requests.push(url.pathname + url.search);
    const prefix = `/api/v1/topics/${FAKE_TOPIC}/messages`;
    if (url.origin !== FAKE_MIRROR || !url.pathname.startsWith(prefix))
      return Response.json({}, { status: 404 });

    const single = /^\/(\d+)$/.exec(url.pathname.slice(prefix.length));
    if (single?.[1]) {
      const seq = Number(single[1]);
      const entry = this.entries[seq - 1];
      return entry
        ? Response.json(this.json(seq, entry))
        : Response.json({ _status: { messages: [{ message: "Not found" }] } }, { status: 404 });
    }

    const at = url.searchParams.get("timestamp")?.replace("eq:", "");
    if (at !== undefined) {
      const index = this.entries.findIndex((e) => e.consensusTimestamp === at);
      const hit = this.entries[index];
      return Response.json({
        messages: hit ? [this.json(index + 1, hit)] : [],
        links: { next: null },
      });
    }

    const after = Number(url.searchParams.get("sequencenumber")?.replace("gt:", "") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), this.pageSize);
    const page = this.entries
      .slice(after, after + limit)
      .map((e, i) => this.json(after + i + 1, e));
    const last = after + page.length;
    return Response.json({
      messages: page,
      links: {
        next:
          last < this.entries.length ? `${prefix}?limit=${limit}&sequencenumber=gt:${last}` : null,
      },
    });
  };
}
