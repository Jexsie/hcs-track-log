import type { EventVerdict } from "@/lib/verify/verdicts";
import styles from "./verdict-badge.module.css";

export function VerdictBadge({ verdict }: { verdict: EventVerdict | undefined }) {
  if (!verdict) {
    return (
      <span className={`${styles.badge} ${styles.pending}`} aria-live="polite">
        <span className={styles.spinner} aria-hidden /> Checking ledger…
      </span>
    );
  }
  if (verdict.status === "verified") {
    return (
      <a
        className={`${styles.badge} ${styles.verified}`}
        href={verdict.mirrorUrl}
        target="_blank"
        rel="noreferrer"
      >
        ✅ Verified against ledger
      </a>
    );
  }
  if (verdict.status === "tampered") {
    return <span className={`${styles.badge} ${styles.tampered}`}>⚠️ Does not match ledger</span>;
  }
  return <span className={`${styles.badge} ${styles.unavailable}`}>Ledger unreachable</span>;
}
