import type { PublicKey } from "@hiero-ledger/sdk";
import { type ScheduleState, keyMembers } from "@/lib/mirror/ledger-state";
import type { DecodedKey } from "@/lib/proto/hedera";

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export type ScheduleCheck = { ok: true } | { ok: false; reason: string };

/** Does the on-chain scheduled message equal the envelope recomputed from the displayed content? */
export function checkScheduledMessage(
  expected: Uint8Array | null,
  schedule: ScheduleState,
  topicId: string,
): ScheduleCheck {
  if (!expected) {
    return {
      ok: false,
      reason: "the displayed content is invalid or does not match its tracking ID",
    };
  }

  const scheduled = schedule.scheduledMessage;

  if (!scheduled) return { ok: false, reason: "the schedule does not wrap a topic message" };

  if (scheduled.topicId !== topicId) {
    return { ok: false, reason: `the schedule targets topic ${scheduled.topicId}, not ${topicId}` };
  }

  if (!sameBytes(scheduled.message, expected)) {
    return {
      ok: false,
      reason: "the scheduled ledger message does not match the displayed content",
    };
  }

  return { ok: true };
}

export interface ApprovalProgress {
  approvals: number;
  required: number;
  /** How many keys are authorized to approve (members of the submit key). */
  authorizedKeys: number;
  alreadySignedByYou: boolean;
  /** Your wallet's key is one of the submit keys. */
  youCanApprove: boolean;
}

function requiredSignatures(key: DecodedKey | null): number {
  if (!key) return 0;
  if (key.kind === "threshold") return key.threshold;
  if (key.kind === "keyList") return key.keys.length;

  return 1;
}

/** Approval count, from the schedule's signatures that belong to the topic's submit key. */
export function approvalProgress(
  signerPublicKeys: readonly Uint8Array[],
  submitKey: DecodedKey | null,
  you: PublicKey | null,
): ApprovalProgress {
  const members = keyMembers(submitKey).map((k) => k.toBytesRaw());
  const signed = members.filter((m) => signerPublicKeys.some((s) => sameBytes(s, m)));
  const yours = you?.toBytesRaw();

  return {
    approvals: signed.length,
    required: requiredSignatures(submitKey),
    authorizedKeys: members.length,
    alreadySignedByYou: yours !== undefined && signed.some((m) => sameBytes(m, yours)),
    youCanApprove: yours !== undefined && members.some((m) => sameBytes(m, yours)),
  };
}
