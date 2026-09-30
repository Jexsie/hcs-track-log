"use client";

import { sampleDataAllowed } from "@/lib/admin/sample-data";
import { useAdmin } from "./admin-context";

/** Fills the form with random, valid demo data. Hidden on mainnet. */
export function SampleDataButton({ onFill, disabled }: { onFill: () => void; disabled?: boolean }) {
  const { config } = useAdmin();

  if (!sampleDataAllowed(config.network)) return null;

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onFill}
        disabled={disabled}
        className="cursor-pointer rounded-lg border border-dashed border-line bg-surface px-3 py-1.5 text-sm font-semibold text-muted disabled:opacity-50"
      >
        Fill with sample data
      </button>
    </div>
  );
}
