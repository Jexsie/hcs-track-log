import { PublicKey } from "@hiero-ledger/sdk";
import {
  type DecodedKey,
  type ScheduledTopicMessage,
  decodeKey,
  decodeScheduledTopicMessage,
} from "@/lib/proto/hedera";
import { ENTITY_ID, MirrorRequestError, decodeBase64, defaultFetch, getMirrorJson } from "./http";

/** Reads of on-chain state (accounts, topics, schedules) from the public mirror node. */

type Json = Record<string, unknown>;
const asObject = (v: unknown): Json => (typeof v === "object" && v !== null ? (v as Json) : {});
const base = (url: string) => url.replace(/\/+$/, "");

function entity(id: string): string {
  if (!ENTITY_ID.test(id)) throw new MirrorRequestError(`invalid entity id "${id}"`);
  return id;
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex))
    throw new MirrorRequestError("mirror node returned invalid hex");
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
}

function parseKey(value: unknown): DecodedKey | null {
  if (value === null || value === undefined) return null;
  const { _type, key } = asObject(value);
  if (typeof key !== "string")
    throw new MirrorRequestError("mirror node returned an unexpected key shape");
  if (_type === "ED25519") return { kind: "ed25519", publicKey: hexToBytes(key) };
  if (_type === "ECDSA_SECP256K1") return { kind: "ecdsa-secp256k1", publicKey: hexToBytes(key) };
  if (_type === "ProtobufEncoded") return decodeKey(hexToBytes(key));
  return { kind: "unsupported" };
}

/** Convert a decoded simple key to an SDK PublicKey; null for anything else. */
export function toPublicKey(key: DecodedKey): PublicKey | null {
  if (key.kind === "ed25519") return PublicKey.fromBytesED25519(key.publicKey);
  if (key.kind === "ecdsa-secp256k1") return PublicKey.fromBytesECDSA(key.publicKey);
  return null;
}

/** The account's current key. Only single ED25519/ECDSA keys can sign in with a wallet. */
export async function fetchAccountKey(
  mirrorBaseUrl: string,
  accountId: string,
  fetchImpl: typeof fetch = defaultFetch,
): Promise<PublicKey> {
  const body = asObject(
    await getMirrorJson(
      `${base(mirrorBaseUrl)}/api/v1/accounts/${entity(accountId)}`,
      fetchImpl,
      `account ${accountId}`,
    ),
  );
  const key = parseKey(body.key);
  const publicKey = key && toPublicKey(key);
  if (!publicKey)
    throw new MirrorRequestError(
      `account ${accountId} does not have a single ED25519 or ECDSA key`,
    );
  return publicKey;
}

export interface TopicKeys {
  adminKey: DecodedKey | null;
  submitKey: DecodedKey | null;
}

export async function fetchTopicKeys(
  mirrorBaseUrl: string,
  topicId: string,
  fetchImpl: typeof fetch = defaultFetch,
): Promise<TopicKeys> {
  const body = asObject(
    await getMirrorJson(
      `${base(mirrorBaseUrl)}/api/v1/topics/${entity(topicId)}`,
      fetchImpl,
      `topic ${topicId}`,
    ),
  );
  return { adminKey: parseKey(body.admin_key), submitKey: parseKey(body.submit_key) };
}

export interface ScheduleState {
  scheduleId: string;
  /** Consensus time the scheduled transaction executed ("seconds.nanos"), or null if pending. */
  executedTimestamp: string | null;
  deleted: boolean;
  expirationTime: string | null;
  /** Raw public keys that have signed so far. */
  signerPublicKeys: Uint8Array[];
  /** The scheduled topic message, or null if the schedule wraps something else. */
  scheduledMessage: ScheduledTopicMessage | null;
}

export async function fetchSchedule(
  mirrorBaseUrl: string,
  scheduleId: string,
  fetchImpl: typeof fetch = defaultFetch,
): Promise<ScheduleState> {
  const body = asObject(
    await getMirrorJson(
      `${base(mirrorBaseUrl)}/api/v1/schedules/${entity(scheduleId)}`,
      fetchImpl,
      `schedule ${scheduleId}`,
    ),
  );
  if (typeof body.transaction_body !== "string")
    throw new MirrorRequestError("mirror node returned an unexpected schedule");
  const signatures = Array.isArray(body.signatures) ? body.signatures : [];
  return {
    scheduleId,
    executedTimestamp: typeof body.executed_timestamp === "string" ? body.executed_timestamp : null,
    deleted: body.deleted === true,
    expirationTime: typeof body.expiration_time === "string" ? body.expiration_time : null,
    signerPublicKeys: signatures.flatMap((s) => {
      const prefix = asObject(s).public_key_prefix;
      return typeof prefix === "string" ? [decodeBase64(prefix)] : [];
    }),
    scheduledMessage: decodeScheduledTopicMessage(decodeBase64(body.transaction_body)),
  };
}
