import { canonicalize } from "./canonicalize";
import { FieldError } from "./errors";
import { normalizeText, normalizeTimestamp } from "./normalize";
import { readField, readObject } from "./shape";

/** Fields committed by payloadHash. Nothing else about an event is hashed. */
export type CargoEvent = {
  readonly status: string;
  readonly location: string;
  readonly carrier: { readonly name: string; readonly scacCode: string };
  /** ISO-8601 UTC, whole seconds, e.g. "2026-09-25T11:40:00Z" */
  readonly timestamp: string;
};

/** What callers pass in: form input at submit time, or database columns at verify time. */
export interface CargoEventInput {
  readonly status: string;
  readonly location: string;
  readonly carrier: { readonly name: string; readonly scacCode: string };
  readonly timestamp: string | Date;
}

const EVENT_KEYS = ["status", "location", "carrier", "timestamp"] as const;
const CARRIER_KEYS = ["name", "scacCode"] as const;

/** Standard Carrier Alpha Code: 2–4 letters, upper-cased. */
export function normalizeScacCode(value: unknown): string {
  const code = normalizeText(value).toUpperCase();
  if (!/^[A-Z]{2,4}$/.test(code)) throw new FieldError("must be 2–4 letters");
  return code;
}

export function normalizeCargoEvent(input: unknown): CargoEvent {
  const event = readObject(input, "", EVENT_KEYS, "event");
  const carrier = readObject(event.carrier, "carrier", CARRIER_KEYS);
  return {
    status: readField(event, "", "status", normalizeText),
    location: readField(event, "", "location", normalizeText),
    carrier: {
      name: readField(carrier, "carrier", "name", normalizeText),
      scacCode: readField(carrier, "carrier", "scacCode", normalizeScacCode),
    },
    timestamp: readField(event, "", "timestamp", normalizeTimestamp),
  };
}

/**
 * THE canonical builder for events. Submit (form input) and verify (Postgres columns) both call
 * this; there is no other event serialization path.
 */
export function buildEventCanonical(input: unknown): Uint8Array {
  return canonicalize(normalizeCargoEvent(input));
}
