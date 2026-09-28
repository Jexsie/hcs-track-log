import { explorerRecordUrl } from "@/lib/timeline/explorer";
import type { EventVerdict } from "@/lib/verify/verdicts";
import type { HederaNetwork } from "@/lib/wallet/hip820";
import { AlertIcon, CheckIcon } from "./icons";

const BASE =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold no-underline";

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
    const content = (
      <>
        <CheckIcon className="size-3.5" /> Verified
      </>
    );
    return href ? (
      <a
        className={`${BASE} bg-ok-soft text-ok hover:underline`}
        href={href}
        target="_blank"
        rel="noreferrer"
        title="View the original record"
      >
        {content}
      </a>
    ) : (
      <span className={`${BASE} bg-ok-soft text-ok`}>{content}</span>
    );
  }
  if (verdict.status === "tampered") {
    return (
      <span className={`${BASE} bg-danger text-white`}>
        <AlertIcon className="size-3.5" /> Changed
      </span>
    );
  }
  return <span className={`${BASE} bg-warn-soft text-warn`}>Not checked</span>;
}
