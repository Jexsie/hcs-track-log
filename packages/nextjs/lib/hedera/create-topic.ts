import {
  type Client,
  type KeyList,
  type PrivateKey,
  TopicCreateTransaction,
  type TopicId,
  TopicInfoQuery,
} from "@hiero-ledger/sdk";
import { ThresholdKeyError, assertSignersSatisfy, isSameThresholdKey } from "./threshold-key";

export interface TopicKeys {
  /** Threshold key required to update or delete the topic (e.g. to rotate the submit key). */
  adminKey: KeyList;
  /** Threshold key required to submit messages. */
  submitKey: KeyList;
}

export interface CreateTopicOptions extends TopicKeys {
  memo: string;
  /** Admin-key holders co-signing the creation; the network requires the admin key to sign. */
  adminSigners: readonly PrivateKey[];
}

export function buildCreateTopicTransaction({
  adminKey,
  submitKey,
  memo,
}: Omit<CreateTopicOptions, "adminSigners">): TopicCreateTransaction {
  return new TopicCreateTransaction()
    .setAdminKey(adminKey)
    .setSubmitKey(submitKey)
    .setTopicMemo(memo);
}

/** Freeze the creation and co-sign it with enough admin keys, without sending it. */
export async function prepareCreateTopicTransaction(
  client: Client,
  options: CreateTopicOptions,
): Promise<TopicCreateTransaction> {
  assertSignersSatisfy(
    options.adminKey,
    options.adminSigners.map((k) => k.publicKey),
    "admin",
  );
  const tx = buildCreateTopicTransaction(options).freezeWith(client);

  for (const signer of options.adminSigners) await tx.sign(signer);

  return tx;
}

/** Create the topic, then read it back from the network to confirm both keys are in force. */
export async function createTrackingTopic(
  client: Client,
  options: CreateTopicOptions,
): Promise<TopicId> {
  const tx = await prepareCreateTopicTransaction(client, options);
  const response = await tx.execute(client);
  const { topicId } = await response.getReceipt(client);

  if (!topicId) throw new Error("topic creation receipt did not include a topic id");
  await assertTopicKeys(client, topicId, options);

  return topicId;
}

/** Confirm on-chain that the topic's admin and submit keys are exactly the configured ones. */
export async function assertTopicKeys(
  client: Client,
  topicId: TopicId,
  expected: TopicKeys,
): Promise<void> {
  const info = await new TopicInfoQuery().setTopicId(topicId).execute(client);

  if (!isSameThresholdKey(info.adminKey, expected.adminKey)) {
    throw new ThresholdKeyError(
      `topic ${topicId.toString()} does not have the configured threshold admin key`,
    );
  }

  if (!isSameThresholdKey(info.submitKey, expected.submitKey)) {
    throw new ThresholdKeyError(
      `topic ${topicId.toString()} does not enforce the configured threshold submit key`,
    );
  }
}
