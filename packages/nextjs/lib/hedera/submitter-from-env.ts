import { TopicId } from "@hiero-ledger/sdk";
import {
  readOperatorConfig,
  readSignerKeys,
  readSubmitKeyConfig,
  readTopicId,
} from "@/lib/config/env";
import { createClient } from "./client";
import { assertTopicSubmitKey } from "./create-topic";
import { HcsEnvelopeSubmitter } from "./hcs-submitter";
import { parsePrivateKey, parsePublicKey } from "./keys";
import { buildSubmitKey } from "./submit-key";

/**
 * Build the HCS submitter from environment configuration and confirm, on the network, that the
 * configured topic really enforces the configured threshold submit key.
 */
export async function createSubmitterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<HcsEnvelopeSubmitter> {
  const topicId = TopicId.fromString(readTopicId(env));
  const { publicKeys, threshold } = readSubmitKeyConfig(env);
  const submitKey = buildSubmitKey(
    publicKeys.map((k, i) => parsePublicKey(k, `HCS_SUBMIT_PUBLIC_KEYS[${i}]`)),
    threshold,
  );
  const signers = readSignerKeys(env).map((k, i) =>
    parsePrivateKey(k, `HCS_SUBMIT_SIGNER_KEYS[${i}]`),
  );
  const client = createClient(readOperatorConfig(env));
  try {
    const submitter = new HcsEnvelopeSubmitter({ client, topicId, submitKey, signers });
    await assertTopicSubmitKey(client, topicId, submitKey);
    return submitter;
  } catch (error) {
    client.close();
    throw error;
  }
}
