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

export class MirrorNotFoundError extends Error {
  constructor(readonly sequenceNumber: bigint) {
    super(`no message at sequence ${sequenceNumber}`);
    this.name = "MirrorNotFoundError";
  }
}

export class MirrorRequestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MirrorRequestError";
  }
}

export interface MirrorClient {
  getMessage(sequenceNumber: bigint): Promise<MirrorMessage>;
  listMessages(options?: { limit?: number }): AsyncGenerator<MirrorMessage>;
  messageUrl(sequenceNumber: bigint): string;
}

export interface MirrorClientOptions {
  baseUrl: string;
  topicId: string;
  fetch?: typeof fetch;
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
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
  let message: Uint8Array;
  try {
    message = decodeBase64(m.message as string);
  } catch (cause) {
    throw new MirrorRequestError("mirror node message is not valid base64", { cause });
  }
  return {
    topicId,
    sequenceNumber: BigInt(m.sequence_number as number),
    consensusTimestamp: m.consensus_timestamp as string,
    payerAccountId: m.payer_account_id as string,
    message,
  };
}

// Wrapped rather than referenced: an unbound `window.fetch` throws "Illegal invocation" in browsers.
const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

export function createMirrorClient({
  baseUrl,
  topicId,
  fetch: fetchImpl = defaultFetch,
}: MirrorClientOptions): MirrorClient {
  const origin = new URL(baseUrl).origin;
  const base = baseUrl.replace(/\/+$/, "");
  const topicPath = `/api/v1/topics/${encodeURIComponent(topicId)}/messages`;

  async function getJson(url: string, sequenceNumber?: bigint): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(url, { headers: { accept: "application/json" } });
    } catch (cause) {
      throw new MirrorRequestError("mirror node is unreachable", { cause });
    }
    if (response.status === 404 && sequenceNumber !== undefined)
      throw new MirrorNotFoundError(sequenceNumber);
    if (!response.ok) throw new MirrorRequestError(`mirror node responded ${response.status}`);
    try {
      return await response.json();
    } catch (cause) {
      throw new MirrorRequestError("mirror node returned invalid JSON", { cause });
    }
  }

  return {
    messageUrl: (sequenceNumber) => `${base}${topicPath}/${sequenceNumber}`,

    async getMessage(sequenceNumber) {
      return parseMessage(
        await getJson(`${base}${topicPath}/${sequenceNumber}`, sequenceNumber),
        topicId,
      );
    },

    async *listMessages({ limit = 100 } = {}) {
      let next: string | null = `${base}${topicPath}?limit=${limit}&order=asc`;
      while (next) {
        const page = (await getJson(next)) as { messages?: unknown; links?: { next?: unknown } };
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
