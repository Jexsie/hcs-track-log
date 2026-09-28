import type { ReactNode } from "react";
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

const DOT: Record<RowState, string> = {
  pending: "border-muted bg-surface",
  verified: "border-ok bg-ok",
  tampered: "border-danger bg-danger",
  unavailable: "border-warn bg-surface",
};

const CARD: Record<RowState, string> = {
  // Sheen sweeps across cards that are still being checked.
  pending:
    "border border-line after:pointer-events-none after:absolute after:inset-0 after:animate-sheen after:bg-[linear-gradient(100deg,transparent_20%,var(--sheen)_50%,transparent_80%)] motion-reduce:after:animate-none",
  verified: "border border-line",
  tampered: "border-2 border-danger",
  unavailable: "border border-line",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm wrap-anywhere">{children}</dd>
    </div>
  );
}

export function EventCard({
  event,
  verdict,
  network,
  topicId,
}: {
  event: EventDto;
  verdict: EventVerdict | undefined;
  network: HederaNetwork;
  topicId: string;
}) {
  const { content } = event;
  const state: RowState = verdict?.status ?? "pending";
  const recordsUrl = explorerTopicUrl(network, topicId);
  return (
    <li className="relative list-none pl-8 before:absolute before:top-0 before:-bottom-4 before:left-[9px] before:w-0.5 before:bg-line last:before:bottom-auto last:before:h-6">
      <span
        className={`absolute top-5 left-[3px] size-3.5 rounded-full border-[3px] ${DOT[state]}`}
        aria-hidden
      />
      <article
        className={`relative overflow-hidden rounded-xl bg-surface px-4.5 py-4 ${CARD[state]}`}
        aria-busy={!verdict}
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="m-0 text-[1.05rem] font-bold">{content.status}</h3>
          <VerdictBadge verdict={verdict} network={network} />
        </header>
        <p className="mt-1 mb-3 text-muted">{content.location}</p>
        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-2">
          <Field label="Time">{formatUtc(content.timestamp)}</Field>
          <Field label="Carrier">{content.carrier.name}</Field>
          <Field label="Record">#{event.hcsSequenceNumber}</Field>
        </dl>

        {verdict?.status === "tampered" && (
          <p
            className="mt-3.5 mb-0 rounded-[10px] bg-danger-soft px-3.5 py-3 text-sm text-danger"
            role="alert"
          >
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
          <p className="mt-3 mb-0 text-sm text-warn">This update could not be checked right now.</p>
        )}
      </article>
    </li>
  );
}
