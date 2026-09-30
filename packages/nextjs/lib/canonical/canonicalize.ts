/**
 * Values the canonical serializer accepts. Decimals and timestamps are strings by the time they get
 * here (see normalize.ts); the only numbers are safe integers.
 */
export type CanonicalValue = string | number | CanonicalObject;
export interface CanonicalObject {
  readonly [key: string]: CanonicalValue;
}

const encoder = new TextEncoder();

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function serialize(value: CanonicalValue): string {
  if (typeof value === "string") return JSON.stringify(value);

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("canonical numbers must be safe integers");
    }

    return String(value);
  }

  const members = Object.keys(value)
    .sort(byCodeUnit)
    .map((key) => `${JSON.stringify(key)}:${serialize(value[key] as CanonicalValue)}`);

  return `{${members.join(",")}}`;
}

/**
 * Deterministic serialization: keys sorted lexicographically at every level, compact separators
 * (no whitespace), UTF-8 output. This is the only serializer used for hashing.
 */
export function canonicalize(value: CanonicalObject): Uint8Array {
  return encoder.encode(serialize(value));
}
