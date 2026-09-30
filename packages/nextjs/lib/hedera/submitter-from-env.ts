import { TopicId } from "@hiero-ledger/sdk";
import { readKeyConfig, readOperatorConfig, readSignerKeys, readTopicId } from "@/lib/config/env";
import { createClient } from "./client";
import { assertTopicKeys } from "./create-topic";
import { HcsEnvelopeSubmitter } from "./hcs-submitter";
import { parseSignerKeys, parseThresholdKey } from "./threshold-key";

/**
 * Build the HCS submitter from environment configuration and confirm, on the network, that the
 * configured topic carries exactly the configured threshold admin and submit keys. Only the admin
 * PUBLIC keys are needed here; admin private keys are used solely by `npm run topic:create`.
 */
export async function createSubmitterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<HcsEnvelopeSubmitter> {
  const topicId = TopicId.fromString(readTopicId(env));
  const submitKey = parseThresholdKey(readKeyConfig("submit", env), "submit");
  const adminKey = parseThresholdKey(readKeyConfig("admin", env), "admin");
  const signers = parseSignerKeys(readSignerKeys("submit", env), "submit");
  const client = createClient(readOperatorConfig(env));

  try {
    const submitter = new HcsEnvelopeSubmitter({ client, topicId, submitKey, signers });

    await assertTopicKeys(client, topicId, { adminKey, submitKey });

    return submitter;
  } catch (error) {
    client.close();
    throw error;
  }
}
