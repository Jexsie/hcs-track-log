import type { EventVerdict } from "@/lib/verify/verdicts";

const BASE =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold no-underline";

export function VerdictBadge({ verdict }: { verdict: EventVerdict | undefined }) {
  if (!verdict) {
    return (
      <span className={`${BASE} bg-surface-2 text-muted`} aria-live="polite">
        <span
          className="size-2.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
          aria-hidden
        />
        Checking ledger…
      </span>
    );
  }
  if (verdict.status === "verified") {
    return (
      <a
        className={`${BASE} bg-ok-soft text-ok hover:underline`}
        href={verdict.mirrorUrl}
        target="_blank"
        rel="noreferrer"
      >
        ✅ Verified against ledger
      </a>
    );
  }
  if (verdict.status === "tampered") {
    return <span className={`${BASE} bg-danger text-white`}>⚠️ Does not match ledger</span>;
  }
  return <span className={`${BASE} bg-warn-soft text-warn`}>Ledger unreachable</span>;
}
