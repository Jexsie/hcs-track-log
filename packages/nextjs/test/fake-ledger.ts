import type { EnvelopeScheduler, ScheduledSubmission } from "@/lib/approvals/ports";
import type { EnvelopeSubmitter, SubmissionReceipt } from "@/lib/tracking/ports";
import { scheduledTopicMessageBody } from "./proto-writer";

export const FAKE_MIRROR = "https://mirror.test";
export const FAKE_TOPIC = "0.0.5005";

interface FakeSchedule {
  message: Uint8Array;
  memo: string;
  signers: Set<string>;
  executedTimestamp: string | null;
  deleted: boolean;
  expiresAt: Date;
}

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
export class FakeLedger implements EnvelopeSubmitter, EnvelopeScheduler {
  readonly entries: LedgerEntry[] = [];
  readonly requests: string[] = [];
  readonly schedules = new Map<string, FakeSchedule>();
  pageSize = 2;
  /** Raw hex public keys of the topic's submit key, and its threshold (for schedule execution). */
  submitKeys: string[] = [];
  threshold = 2;
  failNextSchedule: Error | null = null;

  /** Like ScheduleCreate wrapping a TopicMessageSubmit: nothing reaches the topic yet. */
  async schedule(message: Uint8Array, memo: string): Promise<ScheduledSubmission> {
    if (this.failNextSchedule) {
      const error = this.failNextSchedule;
      this.failNextSchedule = null;
      throw error;
    }
    const scheduleId = `0.0.${9000 + this.schedules.size}`;
    const expiresAt = new Date(Date.now() + 86_400_000);
    this.schedules.set(scheduleId, {
      message,
      memo,
      signers: new Set(),
      executedTimestamp: null,
      deleted: false,
      expiresAt,
    });
    return { scheduleId, expiresAt };
  }

  /** Like a ScheduleSign from a wallet; executes the message once the threshold is reached. */
  async approve(scheduleId: string, publicKeyHex: string): Promise<void> {
    const s = this.schedules.get(scheduleId);
    if (!s) throw new Error(`no schedule ${scheduleId}`);
    s.signers.add(publicKeyHex);
    const valid = [...s.signers].filter((k) => this.submitKeys.includes(k)).length;
    if (!s.executedTimestamp && valid >= this.threshold) {
      await this.submit(s.message);
      s.executedTimestamp = this.entries.at(-1)?.consensusTimestamp ?? null;
    }
  }

  private scheduleJson(id: string, s: FakeSchedule) {
    return {
      schedule_id: id,
      memo: s.memo,
      executed_timestamp: s.executedTimestamp,
      deleted: s.deleted,
      expiration_time: `${Math.floor(s.expiresAt.getTime() / 1000)}.000000000`,
      signatures: [...s.signers].map((hex) => ({
        public_key_prefix: toBase64(Buffer.from(hex, "hex")),
        type: "ED25519",
      })),
      transaction_body: toBase64(
        scheduledTopicMessageBody(Number(FAKE_TOPIC.split(".")[2]), s.message),
      ),
    };
  }

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
    const scheduleMatch = /^\/api\/v1\/schedules\/(\d+\.\d+\.\d+)$/.exec(url.pathname);
    if (url.origin === FAKE_MIRROR && scheduleMatch?.[1]) {
      const s = this.schedules.get(scheduleMatch[1]);
      return s
        ? Response.json(this.scheduleJson(scheduleMatch[1], s))
        : Response.json({}, { status: 404 });
    }
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
