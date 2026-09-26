import { FieldError } from "./errors";

const INT32_MAX = 2_147_483_647;

function requirePresent(value: unknown): void {
  if (value === undefined || value === null) throw new FieldError("is required");
}

/** Trim, apply Unicode NFC, and require a non-empty string. */
export function normalizeText(value: unknown): string {
  requirePresent(value);
  if (typeof value !== "string") throw new FieldError("must be a string");
  if (!value.isWellFormed()) throw new FieldError("contains invalid Unicode");
  const text = value.trim().normalize("NFC");
  if (text === "") throw new FieldError("is required");
  return text;
}

/** A positive integer that fits Postgres INT. Accepts a number or a string of digits. */
export function normalizePositiveInt(value: unknown): number {
  requirePresent(value);
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && /^\d+$/.test(value.trim())) n = Number(value.trim());
  else throw new FieldError("must be a positive integer");
  if (!Number.isSafeInteger(n) || n < 1 || n > INT32_MAX) {
    throw new FieldError("must be a positive integer");
  }
  return n;
}

export interface DecimalFormat {
  scale: number;
  maxIntegerDigits: number;
}

/** NUMERIC(10,2) */
const NUMERIC_10_2: DecimalFormat = { scale: 2, maxIntegerDigits: 8 };

/**
 * Serialize a non-negative decimal as a fixed-scale string ("142.5" → "142.50").
 *
 * Numbers are read through their shortest round-trip representation (`String(n)`), never through
 * `toFixed`, so floating-point noise is rejected instead of rounded away. Digits beyond the scale
 * must be zero.
 */
export function normalizeDecimal(value: unknown, format: DecimalFormat = NUMERIC_10_2): string {
  requirePresent(value);
  let raw: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new FieldError("must be a finite number");
    raw = String(value);
  } else if (typeof value === "string") {
    raw = value.trim();
  } else {
    throw new FieldError("must be a non-negative decimal number");
  }

  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match?.[1]) throw new FieldError("must be a non-negative decimal number");

  const integer = match[1].replace(/^0+(?=\d)/, "");
  const fraction = match[2] ?? "";
  if (/[1-9]/.test(fraction.slice(format.scale))) {
    throw new FieldError(`must have at most ${format.scale} decimal places`);
  }
  if (integer.length > format.maxIntegerDigits) {
    throw new FieldError(`must have at most ${format.maxIntegerDigits} integer digits`);
  }
  return `${integer}.${fraction.slice(0, format.scale).padEnd(format.scale, "0")}`;
}

const ISO_8601 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))?$/;

function formatUtc(epochMs: number): string {
  const iso = new Date(epochMs).toISOString();
  if (!/^\d{4}-/.test(iso)) throw new FieldError("must be between years 0000 and 9999");
  return `${iso.slice(0, 19)}Z`;
}

/**
 * Normalize to an exact ISO-8601 UTC string at whole-second precision: "YYYY-MM-DDTHH:MM:SSZ".
 *
 * Accepts a Date (e.g. from Postgres timestamptz) or an ISO-8601 string with an explicit offset.
 * Sub-second precision is rejected, never silently truncated.
 */
export function normalizeTimestamp(value: unknown): string {
  requirePresent(value);

  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) throw new FieldError("must be a valid date");
    if (ms % 1000 !== 0) throw new FieldError("must not have sub-second precision");
    return formatUtc(ms);
  }
  if (typeof value !== "string") throw new FieldError("must be an ISO-8601 timestamp string");

  const m = ISO_8601.exec(value.trim());
  if (!m) throw new FieldError("must be an ISO-8601 timestamp (YYYY-MM-DDTHH:MM:SSZ)");
  const [, year, month, day, hour, minute, second, fraction, zone, sign, offH, offM] = m;
  if (!zone) throw new FieldError("must include a UTC offset (Z or ±HH:MM)");
  if (fraction && /[1-9]/.test(fraction))
    throw new FieldError("must not have sub-second precision");

  const parts = [year, month, day, hour, minute, second].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const [y, mo, d, h, mi, s] = parts;
  const localMs = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(localMs);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d ||
    check.getUTCHours() !== h ||
    check.getUTCMinutes() !== mi ||
    check.getUTCSeconds() !== s
  ) {
    throw new FieldError("is not a real calendar date and time");
  }

  let offsetMinutes = 0;
  if (zone !== "Z") {
    const oh = Number(offH);
    const om = Number(offM);
    if (oh > 23 || om > 59) throw new FieldError("is not a real UTC offset");
    offsetMinutes = (sign === "-" ? -1 : 1) * (oh * 60 + om);
  }
  return formatUtc(localMs - offsetMinutes * 60_000);
}
