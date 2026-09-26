"use client";

import Link from "next/link";
import { useState } from "react";
import { createMirrorClient } from "@/lib/mirror/mirror-client";
import type { LedgerLinks } from "@/lib/server/ledger-links";

export interface SubmissionOutcome {
  parcelHash: string;
  hcsSequenceNumber: string;
  /** Envelope bytes as submitted, recomputed in the browser from the submitted content. */
  envelope: string | null;
}

export function SubmissionResult({
  title,
  outcome,
  ledger,
  onAnother,
  anotherLabel,
  onRecordNext,
}: {
  title: string;
  outcome: SubmissionOutcome;
  ledger: LedgerLinks | null;
  onAnother: () => void;
  anotherLabel: string;
  /** Continue with an event for this parcel, in-page (the ID never goes into a URL). */
  onRecordNext?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const mirrorUrl = ledger
    ? createMirrorClient({ baseUrl: ledger.mirrorBaseUrl, topicId: ledger.topicId }).messageUrl(
        BigInt(outcome.hcsSequenceNumber),
      )
    : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(outcome.parcelHash);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      className="grid gap-4 rounded-[14px] border-2 border-ok bg-surface p-5"
      role="status"
      aria-live="polite"
    >
      <div>
        <p className="m-0 text-sm font-semibold text-ok">
          ✅ Anchored on Hedera at HCS sequence #{outcome.hcsSequenceNumber}
        </p>
        <h2 className="mt-1 mb-0 text-xl font-bold">{title}</h2>
      </div>

      <div className="grid gap-1.5">
        <span className="text-xs tracking-wide text-muted uppercase">
          Tracking ID: share this with the consignee
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 rounded-[10px] bg-surface-2 px-3 py-2.5 font-mono text-sm wrap-anywhere">
            {outcome.parcelHash}
          </code>
          <button
            type="button"
            onClick={copy}
            className="cursor-pointer rounded-[10px] border border-line bg-surface px-4 py-2.5 font-semibold text-fg"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {outcome.envelope && (
        <div className="grid gap-1.5">
          <span className="text-xs tracking-wide text-muted uppercase">
            Written to the ledger: nothing else
          </span>
          <code className="rounded-[10px] bg-surface-2 px-3 py-2.5 font-mono text-xs wrap-anywhere">
            {outcome.envelope}
          </code>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/"
          target="_blank"
          className="rounded-[10px] bg-accent px-4 py-2.5 font-semibold text-white no-underline"
        >
          Open public tracker ↗
        </Link>
        {onRecordNext && (
          <button
            type="button"
            onClick={onRecordNext}
            className="cursor-pointer rounded-[10px] border border-line bg-surface px-4 py-2.5 font-semibold text-fg no-underline"
          >
            Record next event
          </button>
        )}
        {mirrorUrl && (
          <a
            href={mirrorUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-[10px] border border-line bg-surface px-4 py-2.5 font-semibold text-fg no-underline"
          >
            View ledger message ↗
          </a>
        )}
        <button
          type="button"
          onClick={onAnother}
          className="cursor-pointer rounded-[10px] px-4 py-2.5 font-semibold text-accent"
        >
          {anotherLabel}
        </button>
      </div>
    </section>
  );
}
