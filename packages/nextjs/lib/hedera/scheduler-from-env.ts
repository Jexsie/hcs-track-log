import { TopicId } from "@hiero-ledger/sdk";
import {
  readApprovalWindowMs,
  readKeyConfig,
  readOperatorConfig,
  readTopicId,
} from "@/lib/config/env";
import { createClient } from "./client";
import { assertTopicKeys } from "./create-topic";
import { HcsScheduler } from "./hcs-scheduler";
import { parsePrivateKey } from "./keys";
import { assertOperatorNotSubmitter, parseThresholdKey } from "./threshold-key";

/**
 * Build the scheduler from env and confirm on-chain that the topic carries exactly the configured
 * threshold admin and submit keys. The server needs only the operator key (to pay for schedules);
 * it holds no submit or admin private keys.
 */
export async function createSchedulerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<HcsScheduler> {
  const topicId = TopicId.fromString(readTopicId(env));
  const submitKey = parseThresholdKey(readKeyConfig("submit", env), "submit");
  const adminKey = parseThresholdKey(readKeyConfig("admin", env), "admin");
  const operator = readOperatorConfig(env);

  assertOperatorNotSubmitter(
    parsePrivateKey(operator.operatorKey, "HEDERA_OPERATOR_KEY").publicKey,
    submitKey,
  );
  const client = createClient(operator);

  try {
    await assertTopicKeys(client, topicId, { adminKey, submitKey });

    return new HcsScheduler({ client, topicId, approvalWindowMs: readApprovalWindowMs(env) });
  } catch (error) {
    client.close();
    throw error;
  }
}
