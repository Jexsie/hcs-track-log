import {
  type Client,
  PrivateKey,
  Status,
  TopicMessageSubmitTransaction,
  type TopicId,
} from "@hiero-ledger/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadRootEnv } from "@/lib/config/load-env";
import { readOperatorConfig } from "@/lib/config/env";
import { createClient } from "@/lib/hedera/client";
import { createTrackingTopic } from "@/lib/hedera/create-topic";
import { HcsEnvelopeSubmitter } from "@/lib/hedera/hcs-submitter";
import { buildSubmitKey } from "@/lib/hedera/submit-key";

/**
 * Live network test of multi-sig enforcement. Costs a few testnet HBAR cents.
 * Opt in with: RUN_TESTNET_TESTS=1 npm run test   (needs HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY)
 */
loadRootEnv();
const enabled = process.env.RUN_TESTNET_TESTS === "1";

describe.skipIf(!enabled)("HCS topic with a 2-of-3 submit key (testnet)", () => {
  const [lone, second, third] = [
    PrivateKey.generateED25519(),
    PrivateKey.generateED25519(),
    PrivateKey.generateED25519(),
  ] as const;
  const submitKey = buildSubmitKey([lone.publicKey, second.publicKey, third.publicKey], 2);
  let client: Client;
  let topicId: TopicId;

  beforeAll(async () => {
    client = createClient(readOperatorConfig());
    topicId = await createTrackingTopic(client, {
      submitKey,
      memo: "hcs-track-log integration test",
    });
  }, 60_000);
  afterAll(() => client?.close());

  it("the network rejects a message signed by only one submitter", async () => {
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage("under-signed")
      .freezeWith(client)
      .sign(lone);
    const response = await tx.execute(client);
    await expect(response.getReceipt(client)).rejects.toMatchObject({
      status: Status.InvalidSignature,
    });
  }, 60_000);

  it("the network accepts a message signed by two submitters", async () => {
    const submitter = new HcsEnvelopeSubmitter({
      client,
      topicId,
      submitKey,
      signers: [second, third],
    });
    const receipt = await submitter.submit(new TextEncoder().encode("threshold-signed"));
    expect(receipt.sequenceNumber).toBeGreaterThanOrEqual(1n);
  }, 60_000);
});
