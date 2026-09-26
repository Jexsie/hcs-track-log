"use client";

export default function TrackError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container stack">
      <section className="notice" role="alert">
        <h1>Could not load this parcel</h1>
        <p>
          The tracking database is unavailable right now. Nothing about the ledger record has
          changed.
        </p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
