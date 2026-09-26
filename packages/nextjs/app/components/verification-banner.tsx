import styles from "./verification-banner.module.css";

export interface BannerCounts {
  total: number;
  verified: number;
  tampered: number;
  unavailable: number;
  parcelTampered: boolean;
}

export function VerificationBanner({
  counts,
  done,
  error,
  topicId,
  onRetry,
}: {
  counts: BannerCounts;
  done: boolean;
  error: string | null;
  topicId: string;
  onRetry: () => void;
}) {
  if (!done) {
    return (
      <div className={`${styles.banner} ${styles.pending}`} role="status" aria-live="polite">
        <span className={styles.pulse} aria-hidden />
        <div>
          <strong>Verifying live ledger integrity…</strong>
          <p>
            Recomputing each event hash and comparing it with topic {topicId} (
            {counts.verified + counts.tampered + counts.unavailable}/{counts.total} checked)
          </p>
        </div>
        <span className={styles.scan} aria-hidden />
      </div>
    );
  }
  if (error) {
    return (
      <div className={`${styles.banner} ${styles.unavailable}`} role="alert">
        <div>
          <strong>Verification could not complete</strong>
          <p>{error}</p>
        </div>
        <button className={styles.retry} onClick={onRetry} type="button">
          Retry
        </button>
      </div>
    );
  }
  if (counts.tampered > 0 || counts.parcelTampered) {
    const parts = [
      counts.tampered > 0 ? `${counts.tampered} of ${counts.total} events` : null,
      counts.parcelTampered ? "the parcel details" : null,
    ].filter(Boolean);
    return (
      <div className={`${styles.banner} ${styles.tampered}`} role="alert">
        <div>
          <strong>⚠️ Security warning: this record has been altered</strong>
          <p>
            {parts.join(" and ")} no longer match what was anchored on the Hedera ledger. Do not
            rely on them.
          </p>
        </div>
      </div>
    );
  }
  if (counts.unavailable > 0) {
    return (
      <div className={`${styles.banner} ${styles.unavailable}`} role="status">
        <div>
          <strong>Partially verified</strong>
          <p>
            {counts.verified} of {counts.total} events verified; the mirror node did not answer for{" "}
            {counts.unavailable}.
          </p>
        </div>
        <button className={styles.retry} onClick={onRetry} type="button">
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className={`${styles.banner} ${styles.verified}`} role="status">
      <div>
        <strong>✅ All {counts.total} events verified against the Hedera ledger</strong>
        <p>
          Every hash was recomputed in your browser from the displayed data and matched topic{" "}
          {topicId}.
        </p>
      </div>
    </div>
  );
}
