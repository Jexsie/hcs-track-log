import {
  type Client,
  PrivateKey,
  Status,
  TopicInfoQuery,
  TopicMessageSubmitTransaction,
  TopicUpdateTransaction,
  type TopicId,
} from "@hiero-ledger/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadRootEnv } from "@/lib/config/load-env";
import { readOperatorConfig } from "@/lib/config/env";
import { createClient } from "@/lib/hedera/client";
import { createTrackingTopic } from "@/lib/hedera/create-topic";
import { HcsEnvelopeSubmitter } from "@/lib/hedera/hcs-submitter";
import { buildThresholdKey, isSameThresholdKey } from "@/lib/hedera/threshold-key";

/**
 * Live network test of multi-sig enforcement for both topic keys. Costs a few testnet HBAR cents.
 * Opt in with: RUN_TESTNET_TESTS=1 npm run test   (needs HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY)
 */
loadRootEnv();
const enabled = process.env.RUN_TESTNET_TESTS === "1";

describe.skipIf(!enabled)("HCS topic with 2-of-3 submit and admin keys (testnet)", () => {
  const [lone, second, third] = [
    PrivateKey.generateED25519(),
    PrivateKey.generateED25519(),
    PrivateKey.generateED25519(),
  ] as const;
  const [admin1, admin2, admin3] = [
    PrivateKey.generateED25519(),
    PrivateKey.generateED25519(),
    PrivateKey.generateED25519(),
  ] as const;
  const submitKey = buildThresholdKey(
    [lone.publicKey, second.publicKey, third.publicKey],
    2,
    "submit",
  );
  const adminKey = buildThresholdKey(
    [admin1.publicKey, admin2.publicKey, admin3.publicKey],
    2,
    "admin",
  );
  let client: Client;
  let topicId: TopicId;

  beforeAll(async () => {
    client = createClient(readOperatorConfig());
    topicId = await createTrackingTopic(client, {
      adminKey,
      submitKey,
      adminSigners: [admin1, admin2],
      memo: "hcs-track-log integration test",
    });
  }, 60_000);
  afterAll(() => client?.close());

  it("the topic carries both threshold keys on-chain", async () => {
    const info = await new TopicInfoQuery().setTopicId(topicId).execute(client);
    expect(isSameThresholdKey(info.adminKey, adminKey)).toBe(true);
    expect(isSameThresholdKey(info.submitKey, submitKey)).toBe(true);
  }, 60_000);

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

  it("the network rejects a topic update signed by only one admin", async () => {
    const tx = await new TopicUpdateTransaction()
      .setTopicId(topicId)
      .setTopicMemo("hijacked")
      .freezeWith(client)
      .sign(admin1);
    const response = await tx.execute(client);
    await expect(response.getReceipt(client)).rejects.toMatchObject({
      status: Status.InvalidSignature,
    });
  }, 60_000);

  it("the network accepts a topic update signed by two admins", async () => {
    const tx = new TopicUpdateTransaction()
      .setTopicId(topicId)
      .setTopicMemo("updated by 2-of-3")
      .freezeWith(client);
    await tx.sign(admin2);
    await tx.sign(admin3);
    const receipt = await (await tx.execute(client)).getReceipt(client);
    expect(receipt.status).toBe(Status.Success);
  }, 60_000);
});
