import type { HederaNetwork } from "@/lib/wallet/hip820";
import { explorerRecordUrl } from "@/lib/timeline/explorer";
import type { EventVerdict } from "@/lib/verify/verdicts";

const BASE =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold no-underline";

export function VerdictBadge({
  verdict,
  network,
}: {
  verdict: EventVerdict | undefined;
  network: HederaNetwork;
}) {
  if (!verdict) {
    return (
      <span className={`${BASE} bg-surface-2 text-muted`} aria-live="polite">
        <span
          className="size-2.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
          aria-hidden
        />
        Checking
      </span>
    );
  }
  if (verdict.status === "verified") {
    const href = explorerRecordUrl(network, verdict.consensusTimestamp);
    return href ? (
      <a
        className={`${BASE} bg-ok-soft text-ok hover:underline`}
        href={href}
        target="_blank"
        rel="noreferrer"
        title="View the original record"
      >
        Verified
      </a>
    ) : (
      <span className={`${BASE} bg-ok-soft text-ok`}>Verified</span>
    );
  }
  if (verdict.status === "tampered")
    return <span className={`${BASE} bg-danger text-white`}>Changed</span>;
  return <span className={`${BASE} bg-warn-soft text-warn`}>Not checked</span>;
}
