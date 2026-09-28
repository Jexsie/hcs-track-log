import { MirrorNotFoundError } from "@/lib/mirror/http";
import type { ScheduleState } from "@/lib/mirror/ledger-state";
import type { MirrorClient } from "@/lib/mirror/mirror-client";
import { expectedEnvelope } from "./expected-envelope";
import type { PendingStore } from "./ports";

export class SubmissionNotFoundError extends Error {
  constructor(readonly id: string) {
    super("no such submission");
    this.name = "SubmissionNotFoundError";
  }
}

export type FinalizeResult =
  | { status: "pending"; approvals: number; awaitingMirror: boolean }
  | { status: "executed"; hcsSequenceNumber: bigint }
  | { status: "expired" | "rejected"; reason: string };

export interface FinalizeDeps {
  pending: PendingStore;
  topicId: string;
  readSchedule: (scheduleId: string) => Promise<ScheduleState>;
  messages: Pick<MirrorClient, "getMessageAt">;
  now?: () => Date;
}

/** An executed schedule with no topic message this long after execution failed on-chain. */
const EXECUTION_GRACE_MS = 5 * 60_000;

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
const consensusMs = (ts: string) => Number(ts.split(".")[0]) * 1000;

/**
 * Move an approved submission into the read cache. HCS-first: the cache is written only once the
 * mirror node shows the executed topic message, and only if it matches the staged content.
 */
export async function finalizeSubmission(id: string, deps: FinalizeDeps): Promise<FinalizeResult> {
  const now = (deps.now ?? (() => new Date()))();
  const submission = await deps.pending.get(id);
  if (!submission) throw new SubmissionNotFoundError(id);
  if (submission.status === "executed" && submission.hcsSequenceNumber !== null) {
    return { status: "executed", hcsSequenceNumber: submission.hcsSequenceNumber };
  }
  if (submission.status !== "pending") {
    return {
      status: submission.status === "expired" ? "expired" : "rejected",
      reason: submission.statusReason ?? "",
    };
  }

  const reject = async (reason: string): Promise<FinalizeResult> => {
    await deps.pending.close(id, "rejected", reason);
    return { status: "rejected", reason };
  };

  const expected = await expectedEnvelope(submission);
  let schedule: ScheduleState;
  try {
    schedule = await deps.readSchedule(submission.scheduleId);
  } catch (error) {
    // A schedule created seconds ago may not be indexed by the mirror node yet.
    if (error instanceof MirrorNotFoundError)
      return { status: "pending", approvals: 0, awaitingMirror: true };
    throw error;
  }
  const scheduled = schedule.scheduledMessage;
  if (
    !expected ||
    !scheduled ||
    scheduled.topicId !== deps.topicId ||
    !sameBytes(scheduled.message, expected)
  ) {
    return reject("staged content does not match the scheduled ledger message");
  }

  if (!schedule.executedTimestamp) {
    if (schedule.deleted || submission.expiresAt.getTime() <= now.getTime()) {
      const reason = "approval window closed before enough approvals";
      await deps.pending.close(id, "expired", reason);
      return { status: "expired", reason };
    }
    return {
      status: "pending",
      approvals: schedule.signerPublicKeys.length,
      awaitingMirror: false,
    };
  }

  const message = await deps.messages.getMessageAt(schedule.executedTimestamp);
  if (!message) {
    if (now.getTime() - consensusMs(schedule.executedTimestamp) > EXECUTION_GRACE_MS) {
      return reject(
        "schedule executed but no topic message was recorded (the scheduled transaction failed)",
      );
    }
    return { status: "pending", approvals: schedule.signerPublicKeys.length, awaitingMirror: true };
  }
  if (!sameBytes(message.message, expected))
    return reject("executed topic message does not match the staged content");

  await deps.pending.complete(submission, {
    parcelHash: submission.parcelHash,
    event: submission.event,
    hcsSequenceNumber: message.sequenceNumber,
    payerAccountId: message.payerAccountId,
  });
  return { status: "executed", hcsSequenceNumber: message.sequenceNumber };
}
