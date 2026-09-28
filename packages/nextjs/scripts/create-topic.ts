/**
 * npm run topic:create
 *
 * Creates the tracking topic with two threshold keys:
 *   admin key  ← HCS_ADMIN_PUBLIC_KEYS / HCS_ADMIN_THRESHOLD, co-signed by HCS_ADMIN_SIGNER_KEYS
 *   submit key ← HCS_SUBMIT_PUBLIC_KEYS / HCS_SUBMIT_THRESHOLD
 * then reads the topic back to confirm both are in force.
 */
import { readKeyConfig, readOperatorConfig, readSignerKeys } from "@/lib/config/env";
import { loadRootEnv } from "@/lib/config/load-env";
import { createClient } from "@/lib/hedera/client";
import { createTrackingTopic } from "@/lib/hedera/create-topic";
import { parsePrivateKey } from "@/lib/hedera/keys";
import {
  assertOperatorNotSubmitter,
  parseSignerKeys,
  parseThresholdKey,
} from "@/lib/hedera/threshold-key";

async function main(): Promise<void> {
  loadRootEnv();
  const operator = readOperatorConfig();
  const submit = readKeyConfig("submit");
  const admin = readKeyConfig("admin");
  const submitKey = parseThresholdKey(submit, "submit");
  const adminKey = parseThresholdKey(admin, "admin");
  const adminSigners = parseSignerKeys(readSignerKeys("admin"), "admin");
  assertOperatorNotSubmitter(
    parsePrivateKey(operator.operatorKey, "HEDERA_OPERATOR_KEY").publicKey,
    submitKey,
  );

  const client = createClient(operator);
  try {
    console.log(
      `Creating topic on ${operator.network}: ${submit.threshold}-of-${submit.publicKeys.length} submit key, ` +
        `${admin.threshold}-of-${admin.publicKeys.length} admin key…`,
    );
    const topicId = await createTrackingTopic(client, {
      adminKey,
      submitKey,
      adminSigners,
      memo: "hcs-track-log v1",
    });
    console.log(
      `\n✅ Topic ${topicId.toString()} created; admin and submit keys verified on-chain.\n`,
    );
    console.log(`Add this to .env:\n\n  HCS_TOPIC_ID=${topicId.toString()}\n`);
  } finally {
    client.close();
  }
}

main().catch((error: unknown) => {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
