import type { EventDto } from "@/lib/timeline/dto";
import { explorerTopicUrl } from "@/lib/timeline/explorer";
import { formatUtc } from "@/lib/timeline/format";
import type { EventVerdict } from "@/lib/verify/verdicts";
import type { HederaNetwork } from "@/lib/wallet/hip820";
import { VerdictBadge } from "./verdict-badge";

type RowState = EventVerdict["status"] | "pending";

const REASON: Record<Extract<EventVerdict, { status: "tampered" }>["reason"], string> = {
  "content-mismatch": "This update was changed after it was recorded.",
  "wrong-parcel": "This update belongs to a different shipment.",
  "invalid-content": "This update is damaged and cannot be trusted.",
  "not-an-envelope": "The original record for this update is missing.",
  "no-anchor": "The original record for this update is missing.",
};

/** A stop on the route. The newest stop is highlighted; older stops stay quiet. */
export function EventCard({
  event,
  verdict,
  network,
  topicId,
  latest = false,
}: {
  event: EventDto;
  verdict: EventVerdict | undefined;
  network: HederaNetwork;
  topicId: string;
  latest?: boolean;
}) {
  const { content } = event;
  const state: RowState = verdict?.status ?? "pending";
  const recordsUrl = explorerTopicUrl(network, topicId);
  const dot =
    state === "tampered"
      ? "border-danger bg-danger"
      : latest
        ? "border-cargo bg-cargo ring-4 ring-cargo-soft"
        : state === "verified"
          ? "border-ok bg-surface"
          : "border-line bg-surface";

  return (
    <li className="relative list-none pb-6 pl-9 last:pb-0 before:absolute before:top-5 before:bottom-0 before:left-[9px] before:w-0.5 before:bg-line last:before:hidden">
      <span
        className={`absolute top-1.5 left-[3px] size-3.5 rounded-full border-2 ${dot}`}
        aria-hidden
      />
      <article
        className={`relative overflow-hidden rounded-lg ${state === "tampered" ? "border-2 border-danger p-3" : ""} ${
          state === "pending"
            ? "after:pointer-events-none after:absolute after:inset-0 after:animate-sheen after:bg-[linear-gradient(100deg,transparent_20%,var(--sheen)_50%,transparent_80%)] motion-reduce:after:animate-none"
            : ""
        }`}
        aria-busy={!verdict}
      >
        <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className={`m-0 ${latest ? "text-lg font-bold" : "text-base font-semibold"}`}>
            {content.status}
          </h3>
          {latest && (
            <span className="rounded bg-cargo-soft px-1.5 py-0.5 text-xs font-semibold text-cargo">
              Latest
            </span>
          )}
          <span className="ml-auto">
            <VerdictBadge verdict={verdict} network={network} />
          </span>
        </header>
        <p className={`mt-0.5 mb-0 ${latest ? "text-fg" : "text-muted"}`}>{content.location}</p>
        <p className="mt-1 mb-0 text-xs text-muted tabular-nums">
          {formatUtc(content.timestamp)} · {content.carrier.name} · Record #
          {event.hcsSequenceNumber}
        </p>

        {verdict?.status === "tampered" && (
          <p className="mt-2.5 mb-0 text-sm text-danger" role="alert">
            <strong>Warning:</strong> {REASON[verdict.reason]}{" "}
            {recordsUrl && (
              <a
                className="font-semibold text-danger"
                href={recordsUrl}
                target="_blank"
                rel="noreferrer"
              >
                View original records
              </a>
            )}
          </p>
        )}
        {verdict?.status === "unavailable" && (
          <p className="mt-1.5 mb-0 text-sm text-warn">
            This update could not be checked right now.
          </p>
        )}
      </article>
    </li>
  );
}
