import { SearchForm } from "./components/search-form";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className="container stack">
      <section className={styles.hero}>
        <h1>Track a parcel. Verify every step.</h1>
        <p>
          Each shipment event is notarized on the Hedera Consensus Service. Enter a tracking ID to
          see its journey; your browser then recomputes every event&apos;s SHA-256 from the data
          shown and checks it against the public ledger.
        </p>
        <SearchForm />
      </section>

      <ol className={styles.steps} aria-label="How verification works">
        <li>
          <strong>Instant timeline</strong>
          <span>Events load from the database cache immediately.</span>
        </li>
        <li>
          <strong>Recompute, never trust</strong>
          <span>Hashes are recomputed from the displayed content, not read from storage.</span>
        </li>
        <li>
          <strong>Compare with the ledger</strong>
          <span>
            Each hash is matched against its anchor on the mirror node. Any edit is flagged.
          </span>
        </li>
      </ol>
    </main>
  );
}
