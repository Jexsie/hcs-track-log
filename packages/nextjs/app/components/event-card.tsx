import { formatConsensusTimestamp, formatUtc, shortHash } from "@/lib/timeline/format";
import type { EventDto } from "@/lib/timeline/dto";
import type { EventVerdict } from "@/lib/verify/verdicts";
import styles from "./event-card.module.css";
import { VerdictBadge } from "./verdict-badge";

const REASON_LABEL: Record<Extract<EventVerdict, { status: "tampered" }>["reason"], string> = {
  "content-mismatch": "The stored record was altered after it was anchored.",
  "wrong-parcel": "The ledger anchor at this sequence number belongs to a different parcel.",
  "invalid-content": "The stored record is malformed and cannot be what was anchored.",
  "not-an-envelope": "The ledger message at this sequence number is not an event anchor.",
  "no-anchor":
    "There is no ledger message at this sequence number. If it was recorded seconds ago, retry.",
};

function Hash({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={styles.hash}>
      <dt>{label}</dt>
      <dd title={value ?? undefined}>{value ? shortHash(value) : "—"}</dd>
    </div>
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
  const state = verdict?.status ?? "pending";
  return (
    <li className={`${styles.item} ${styles[state]}`}>
      <span className={styles.dot} aria-hidden />
      <article className={styles.card} aria-busy={!verdict}>
        <header className={styles.header}>
          <h3 className={styles.status}>{content.status}</h3>
          <VerdictBadge verdict={verdict} />
        </header>
        <p className={styles.location}>{content.location}</p>
        <dl className={styles.meta}>
          <div>
            <dt>Event time</dt>
            <dd>{formatUtc(content.timestamp)}</dd>
          </div>
          <div>
            <dt>Carrier</dt>
            <dd>
              {content.carrier.name} <span className={styles.scac}>{content.carrier.scacCode}</span>
            </dd>
          </div>
          <div>
            <dt>HCS sequence</dt>
            <dd className={styles.mono}>#{event.hcsSequenceNumber}</dd>
          </div>
        </dl>

        {verdict?.status === "verified" && (
          <dl className={styles.proof}>
            <Hash label="Recomputed payload hash" value={verdict.payloadHash} />
            <div className={styles.hash}>
              <dt>Consensus</dt>
              <dd>{formatConsensusTimestamp(verdict.consensusTimestamp)}</dd>
            </div>
            <div className={styles.hash}>
              <dt>Payer (ledger)</dt>
              <dd className={styles.mono}>{verdict.ledgerPayer}</dd>
            </div>
          </dl>
        )}

        {verdict?.status === "tampered" && (
          <div className={styles.warning} role="alert">
            <strong>
              Security warning: the record at HCS sequence #{verdict.sequenceNumber.toString()} does
              not match the ledger.
            </strong>
            <p>{REASON_LABEL[verdict.reason]}</p>
            <dl className={styles.proof}>
              <Hash label="Recomputed from this record" value={verdict.recomputedPayloadHash} />
              <Hash label="Anchored on ledger" value={verdict.onChainPayloadHash} />
            </dl>
            <a href={verdict.mirrorUrl} target="_blank" rel="noreferrer">
              Inspect ledger message #{verdict.sequenceNumber.toString()} →
            </a>
          </div>
        )}

        {verdict?.status === "unavailable" && (
          <p className={styles.unavailableNote}>
            Could not reach the mirror node: {verdict.message}
          </p>
        )}
      </article>
    </li>
  );
}
