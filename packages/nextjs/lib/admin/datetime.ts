const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Convert a `<input type="datetime-local">` value (the admin's wall-clock time, no offset) to the
 * canonical "YYYY-MM-DDTHH:MM:SSZ" UTC string. Returns null for empty or malformed input.
 */
export function localInputToUtc(value: string): string | null {
  const m = LOCAL.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "0"] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(date.getTime()) ? null : `${date.toISOString().slice(0, 19)}Z`;
}

/** Local wall-clock value for a datetime-local input, at whole seconds. */
export function toLocalInputValue(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
