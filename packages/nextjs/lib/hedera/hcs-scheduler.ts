import {
  type Client,
  ScheduleCreateTransaction,
  Timestamp,
  type TopicId,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";
import type { EnvelopeScheduler, ScheduledSubmission } from "@/lib/approvals/ports";

export interface HcsSchedulerOptions {
  client: Client;
  topicId: TopicId;
  /** How long approvers have to sign (Hedera allows long-term schedules up to ~62 days). */
  approvalWindowMs: number;
  now?: () => Date;
}

/**
 * Wraps each envelope in a ScheduleCreate paid by the operator. The operator holds NO submit key:
 * the topic message executes only once enough submit-key holders sign the schedule (ScheduleSign)
 * from their own wallets.
 */
export class HcsScheduler implements EnvelopeScheduler {
  constructor(private readonly options: HcsSchedulerOptions) {}

  async schedule(message: Uint8Array, memo: string): Promise<ScheduledSubmission> {
    const { client, topicId, approvalWindowMs, now = () => new Date() } = this.options;
    const expiresAt = new Date(Math.floor((now().getTime() + approvalWindowMs) / 1000) * 1000);
    const response = await new ScheduleCreateTransaction()
      .setScheduledTransaction(
        new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message),
      )
      .setScheduleMemo(memo)
      .setExpirationTime(Timestamp.fromDate(expiresAt))
      .setWaitForExpiry(false)
      .execute(client);
    const { scheduleId } = await response.getReceipt(client);

    if (!scheduleId) throw new Error("schedule receipt did not include a schedule id");

    return { scheduleId: scheduleId.toString(), expiresAt };
  }
}
