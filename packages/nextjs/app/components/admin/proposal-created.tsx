"use client";

import Link from "next/link";
import type { SubmissionDto } from "@/lib/approvals/dto";
import { ApprovalCard } from "./approval-card";

/** After submitting: the proposer approves first; other admins approve under Approvals. */
export function ProposalCreated({
  submission,
  onAnother,
  anotherLabel,
  onRecordNext,
}: {
  submission: SubmissionDto;
  onAnother: () => void;
  anotherLabel: string;
  onRecordNext?: () => void;
}) {
  return (
    <section className="grid gap-4" aria-live="polite">
      <div className="rounded-[14px] border-2 border-accent bg-surface p-5">
        <p className="m-0 font-semibold text-accent">Submitted for approval</p>
        <p className="mt-1 mb-0 text-sm text-muted">
          Customers will see it once enough admins approve. Confirm your own approval in your
          wallet; others can approve it under <Link href="/admin/approvals">Approvals</Link>.
        </p>
      </div>
      <ApprovalCard submission={submission} autoApprove />
      <div className="flex flex-wrap gap-2">
        {onRecordNext && (
          <button
            type="button"
            onClick={onRecordNext}
            className="cursor-pointer rounded-[10px] border border-line bg-surface px-4 py-2.5 font-semibold text-fg"
          >
            Add next update
          </button>
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
