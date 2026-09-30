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
