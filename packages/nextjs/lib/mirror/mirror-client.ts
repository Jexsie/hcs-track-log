import { MirrorRequestError, decodeBase64, defaultFetch, getMirrorJson } from "./http";

/**
 * Minimal Hedera mirror node client for topic messages. Runs unchanged in Node and the browser
 * (public mirror nodes send `Access-Control-Allow-Origin: *`).
 */

export interface MirrorMessage {
  topicId: string;
  sequenceNumber: bigint;
  /** "seconds.nanoseconds" */
  consensusTimestamp: string;
  /** Authoritative payer from the transaction record. */
  payerAccountId: string;
  message: Uint8Array;
}

export interface MirrorClient {
  getMessage(sequenceNumber: bigint): Promise<MirrorMessage>;
  /** The message with exactly this consensus timestamp ("seconds.nanos"), or null. */
  getMessageAt(consensusTimestamp: string): Promise<MirrorMessage | null>;
  listMessages(options?: { limit?: number }): AsyncGenerator<MirrorMessage>;
  messageUrl(sequenceNumber: bigint): string;
}

export interface MirrorClientOptions {
  baseUrl: string;
  topicId: string;
  fetch?: typeof fetch;
}

function parseMessage(body: unknown, topicId: string): MirrorMessage {
  const m = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const valid =
    typeof m.message === "string" &&
    typeof m.consensus_timestamp === "string" &&
    typeof m.payer_account_id === "string" &&
    typeof m.topic_id === "string" &&
    Number.isSafeInteger(m.sequence_number);
  if (!valid) throw new MirrorRequestError("mirror node returned an unexpected message shape");
  if (m.topic_id !== topicId) {
    throw new MirrorRequestError(`mirror node returned a message for topic ${String(m.topic_id)}`);
  }
  const message = decodeBase64(m.message as string);
  return {
    topicId,
    sequenceNumber: BigInt(m.sequence_number as number),
    consensusTimestamp: m.consensus_timestamp as string,
    payerAccountId: m.payer_account_id as string,
    message,
  };
}

export function createMirrorClient({
  baseUrl,
  topicId,
  fetch: fetchImpl = defaultFetch,
}: MirrorClientOptions): MirrorClient {
  const origin = new URL(baseUrl).origin;
  const base = baseUrl.replace(/\/+$/, "");
  const topicPath = `/api/v1/topics/${encodeURIComponent(topicId)}/messages`;

  return {
    messageUrl: (sequenceNumber) => `${base}${topicPath}/${sequenceNumber}`,

    async getMessage(sequenceNumber) {
      const url = `${base}${topicPath}/${sequenceNumber}`;
      const body = await getMirrorJson(url, fetchImpl, `message at sequence ${sequenceNumber}`);
      return parseMessage(body, topicId);
    },

    async getMessageAt(consensusTimestamp) {
      if (!/^\d+\.\d{1,9}$/.test(consensusTimestamp)) {
        throw new MirrorRequestError("invalid consensus timestamp");
      }
      const url = `${base}${topicPath}?timestamp=eq:${consensusTimestamp}&limit=1`;
      const page = (await getMirrorJson(url, fetchImpl)) as { messages?: unknown };
      if (!Array.isArray(page.messages)) {
        throw new MirrorRequestError("mirror node returned an unexpected page");
      }
      const [first] = page.messages as unknown[];
      return first === undefined ? null : parseMessage(first, topicId);
    },

    async *listMessages({ limit = 100 } = {}) {
      let next: string | null = `${base}${topicPath}?limit=${limit}&order=asc`;
      while (next) {
        const page = (await getMirrorJson(next, fetchImpl)) as {
          messages?: unknown;
          links?: { next?: unknown };
        };
        if (!Array.isArray(page.messages))
          throw new MirrorRequestError("mirror node returned an unexpected page");
        for (const raw of page.messages) yield parseMessage(raw, topicId);

        const link = page.links?.next;
        if (typeof link !== "string") break;
        const url = new URL(link, origin);
        if (url.origin !== origin)
          throw new MirrorRequestError("pagination link points at another origin");
        next = url.href;
      }
    },
  };
}
