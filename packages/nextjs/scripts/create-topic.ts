/**
 * npm run topic:create
 *
 * Creates the tracking topic with a threshold (multi-signature) submit key built from
 * HCS_SUBMIT_PUBLIC_KEYS / HCS_SUBMIT_THRESHOLD, then reads it back to confirm enforcement.
 */
import { readOperatorConfig, readSubmitKeyConfig } from "@/lib/config/env";
import { loadRootEnv } from "@/lib/config/load-env";
import { createClient } from "@/lib/hedera/client";
import { createTrackingTopic } from "@/lib/hedera/create-topic";
import { parsePublicKey } from "@/lib/hedera/keys";
import { buildSubmitKey } from "@/lib/hedera/submit-key";

async function main(): Promise<void> {
  loadRootEnv();
  const operator = readOperatorConfig();
  const { publicKeys, threshold } = readSubmitKeyConfig();
  const submitKey = buildSubmitKey(
    publicKeys.map((k, i) => parsePublicKey(k, `HCS_SUBMIT_PUBLIC_KEYS[${i}]`)),
    threshold,
  );

  const client = createClient(operator);
  try {
    console.log(
      `Creating topic on ${operator.network} with a ${threshold}-of-${publicKeys.length} submit key…`,
    );
    const topicId = await createTrackingTopic(client, { submitKey, memo: "hcs-track-log v1" });
    console.log(`\n✅ Topic ${topicId.toString()} created; submit key verified on-chain.\n`);
    console.log(`Add this to .env:\n\n  HCS_TOPIC_ID=${topicId.toString()}\n`);
  } finally {
    client.close();
  }
}

main().catch((error: unknown) => {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
