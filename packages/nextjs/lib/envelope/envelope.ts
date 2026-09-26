import { canonicalize } from "@/lib/canonical/canonicalize";
import { isSha256Hex } from "@/lib/hashing/sha256";

export const ENVELOPE_VERSION = 1;

/** The entire on-chain message. Blind notary fields only; no business metadata. */
export interface HcsMessageEnvelope {
  /** envelope version */
  readonly v: number;
  /** tracking ID, constant per parcel */
  readonly parcelHash: string;
  /** SHA-256 of THIS event's canonical content */
  readonly payloadHash: string;
}

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeError";
  }
}

const ENVELOPE_KEYS: readonly string[] = ["v", "parcelHash", "payloadHash"];

function validate(value: unknown): HcsMessageEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EnvelopeError("envelope must be a JSON object");
  }
  const record = value as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(record)) {
    if (!ENVELOPE_KEYS.includes(key))
      throw new EnvelopeError(`envelope has unexpected field "${key}"`);
  }
  if (record.v !== ENVELOPE_VERSION) {
    throw new EnvelopeError(`unsupported envelope version: ${JSON.stringify(record.v)}`);
  }
  for (const key of ["parcelHash", "payloadHash"] as const) {
    if (!isSha256Hex(record[key])) {
      throw new EnvelopeError(`envelope ${key} must be 64 lower-case hex characters`);
    }
  }
  return {
    v: ENVELOPE_VERSION,
    parcelHash: record.parcelHash as string,
    payloadHash: record.payloadHash as string,
  };
}

export function buildEnvelope(hashes: {
  parcelHash: string;
  payloadHash: string;
}): HcsMessageEnvelope {
  return validate({ v: ENVELOPE_VERSION, ...hashes });
}

/** Canonical bytes submitted to the topic. */
export function serializeEnvelope(envelope: HcsMessageEnvelope): Uint8Array {
  return canonicalize({ ...validate(envelope) });
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Parse and strictly validate a message read back from the mirror node. */
export function parseEnvelope(raw: Uint8Array | string): HcsMessageEnvelope {
  let text: string;
  try {
    text = typeof raw === "string" ? raw : utf8.decode(raw);
  } catch {
    throw new EnvelopeError("envelope is not valid UTF-8");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new EnvelopeError("envelope is not valid JSON");
  }
  return validate(parsed);
}
