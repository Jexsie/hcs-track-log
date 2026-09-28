"use client";

import { sampleDataAllowed } from "@/lib/admin/sample-data";
import { useAdmin } from "./admin-context";

/** Fills the form with random, valid demo data. Hidden on mainnet. */
export function SampleDataButton({ onFill, disabled }: { onFill: () => void; disabled?: boolean }) {
  const { config } = useAdmin();
  if (!sampleDataAllowed(config.network)) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line bg-surface-2 px-4 py-2.5">
      <span className="text-sm text-muted">
        Trying things out on {config.network}? Fill the form with random sample data.
      </span>
      <button
        type="button"
        onClick={onFill}
        disabled={disabled}
        className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg disabled:opacity-50"
      >
        🎲 Fill sample data
      </button>
    </div>
  );
}
