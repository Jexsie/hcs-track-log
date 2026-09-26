import {
  type Client,
  type KeyList,
  TopicCreateTransaction,
  type TopicId,
  TopicInfoQuery,
} from "@hiero-ledger/sdk";
import { SubmitKeyError, isSameSubmitKey } from "./submit-key";

export interface CreateTopicOptions {
  submitKey: KeyList;
  memo: string;
}

/**
 * No admin key is set: the topic is immutable, so its submit key can never be replaced by a single
 * party. To rotate signers, create a new topic.
 */
export function buildCreateTopicTransaction({
  submitKey,
  memo,
}: CreateTopicOptions): TopicCreateTransaction {
  return new TopicCreateTransaction().setSubmitKey(submitKey).setTopicMemo(memo);
}

/** Create the topic, then read it back from the network to confirm the submit key is enforced. */
export async function createTrackingTopic(
  client: Client,
  options: CreateTopicOptions,
): Promise<TopicId> {
  const response = await buildCreateTopicTransaction(options).execute(client);
  const { topicId } = await response.getReceipt(client);
  if (!topicId) throw new Error("topic creation receipt did not include a topic id");
  await assertTopicSubmitKey(client, topicId, options.submitKey);
  return topicId;
}

export async function assertTopicSubmitKey(
  client: Client,
  topicId: TopicId,
  expected: KeyList,
): Promise<void> {
  const info = await new TopicInfoQuery().setTopicId(topicId).execute(client);
  if (!isSameSubmitKey(info.submitKey, expected)) {
    throw new SubmitKeyError(
      `topic ${topicId.toString()} does not enforce the configured threshold submit key`,
    );
  }
}
