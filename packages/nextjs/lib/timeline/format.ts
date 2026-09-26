const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "25 Sep 2026, 11:40:00 UTC". Built by hand (not Intl) so server and browser render identical
 * text. Unparseable (e.g. tampered) values are shown verbatim.
 */
export function formatUtc(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const d = new Date(ms);
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${time} UTC`;
}

/** Mirror node consensus timestamps are "seconds.nanoseconds". */
export function formatConsensusTimestamp(value: string): string {
  const seconds = Number(value.split(".")[0]);
  return Number.isFinite(seconds) && /^\d+\.\d+$/.test(value)
    ? formatUtc(new Date(seconds * 1000).toISOString())
    : value;
}

export function shortHash(hash: string): string {
  return hash.length > 20 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
}
