"use client";

import { Notice, PageShell } from "@/app/components/page-shell";

export default function TrackError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageShell>
      <Notice title="Could not load this parcel" alert>
        <p className="mb-3 text-muted">
          The tracking database is unavailable right now. Nothing about the ledger record has
          changed.
        </p>
        <button
          type="button"
          onClick={reset}
          className="cursor-pointer rounded-lg bg-accent px-4 py-2 font-semibold text-white"
        >
          Try again
        </button>
      </Notice>
    </PageShell>
  );
}
