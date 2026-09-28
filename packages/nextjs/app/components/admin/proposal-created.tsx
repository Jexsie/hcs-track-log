"use client";

import Link from "next/link";
import type { SubmissionDto } from "@/lib/approvals/dto";
import { ApprovalCard } from "./approval-card";

/** After proposing: nothing is on the topic yet; show the approval card so the proposer can approve too. */
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
        <p className="m-0 text-sm font-semibold text-accent">
          Proposed: waiting for wallet approvals
        </p>
        <p className="mt-1 mb-0 text-sm text-muted">
          A Hedera scheduled transaction now holds this envelope. It is written to the topic, and
          then to the tracker, only after the required number of administrators approve it in their
          wallets. As the proposer, your approval counts first: your wallet will ask you to confirm
          it. Other administrators will see it under <Link href="/admin/approvals">Approvals</Link>.
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
            Record next event
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
