import { formatConsensusTimestamp, formatUtc, shortHash } from "@/lib/timeline/format";
import type { EventDto } from "@/lib/timeline/dto";
import type { EventVerdict } from "@/lib/verify/verdicts";
import type { ReactNode } from "react";
import { VerdictBadge } from "./verdict-badge";

type RowState = EventVerdict["status"] | "pending";

const REASON_LABEL: Record<Extract<EventVerdict, { status: "tampered" }>["reason"], string> = {
  "content-mismatch": "The stored record was altered after it was anchored.",
  "wrong-parcel": "The ledger anchor at this sequence number belongs to a different parcel.",
  "invalid-content": "The stored record is malformed and cannot be what was anchored.",
  "not-an-envelope": "The ledger message at this sequence number is not an event anchor.",
  "no-anchor":
    "There is no ledger message at this sequence number. If it was recorded seconds ago, retry.",
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

const LABEL = "text-xs tracking-wide text-muted uppercase";
const GRID = "m-0 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-4 gap-y-2";
const PROOF = `${GRID} mt-3 border-t border-dashed border-line pt-3`;

function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className={LABEL}>{label}</dt>
      <dd className={`mt-0.5 text-sm wrap-anywhere ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

function Hash({ label, value }: { label: string; value: string | null }) {
  return (
    <Field label={label} mono>
      <span title={value ?? undefined}>{value ? shortHash(value) : "—"}</span>
    </Field>
  );
}

export function EventCard({
  event,
  verdict,
}: {
  event: EventDto;
  verdict: EventVerdict | undefined;
}) {
  const { content } = event;
  const state: RowState = verdict?.status ?? "pending";
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
          <VerdictBadge verdict={verdict} />
        </header>
        <p className="mt-1 mb-3 text-muted">{content.location}</p>
        <dl className={GRID}>
          <Field label="Event time">{formatUtc(content.timestamp)}</Field>
          <Field label="Carrier">
            {content.carrier.name}{" "}
            <span className="rounded-md bg-surface-2 px-1.5 py-px font-mono text-xs">
              {content.carrier.scacCode}
            </span>
          </Field>
          <Field label="HCS sequence" mono>
            #{event.hcsSequenceNumber}
          </Field>
        </dl>

        {verdict?.status === "verified" && (
          <dl className={PROOF}>
            <Hash label="Recomputed payload hash" value={verdict.payloadHash} />
            <Field label="Consensus">{formatConsensusTimestamp(verdict.consensusTimestamp)}</Field>
            <Field label="Payer (ledger)" mono>
              {verdict.ledgerPayer}
            </Field>
          </dl>
        )}

        {verdict?.status === "tampered" && (
          <div
            className="mt-3.5 rounded-[10px] bg-danger-soft px-3.5 py-3 text-danger"
            role="alert"
          >
            <strong>
              Security warning: the record at HCS sequence #{verdict.sequenceNumber.toString()} does
              not match the ledger.
            </strong>
            <p className="mt-1.5 mb-0 text-fg">{REASON_LABEL[verdict.reason]}</p>
            <dl className={PROOF}>
              <Hash label="Recomputed from this record" value={verdict.recomputedPayloadHash} />
              <Hash label="Anchored on ledger" value={verdict.onChainPayloadHash} />
            </dl>
            <a
              className="mt-2.5 inline-block font-semibold text-danger"
              href={verdict.mirrorUrl}
              target="_blank"
              rel="noreferrer"
            >
              Inspect ledger message #{verdict.sequenceNumber.toString()} →
            </a>
          </div>
        )}

        {verdict?.status === "unavailable" && (
          <p className="mt-3 mb-0 text-sm text-warn">
            Could not reach the mirror node: {verdict.message}
          </p>
        )}
      </article>
    </li>
  );
}
