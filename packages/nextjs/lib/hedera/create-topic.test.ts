import { AccountId, Client, KeyList, PrivateKey } from "@hiero-ledger/sdk";
import { afterAll, describe, expect, it } from "vitest";
import { buildCreateTopicTransaction, prepareCreateTopicTransaction } from "./create-topic";
import {
  ThresholdKeyError,
  buildThresholdKey,
  countSatisfiedSignatures,
  isSameThresholdKey,
} from "./threshold-key";

const client = Client.forTestnet().setOperator(
  AccountId.fromString("0.0.1001"),
  PrivateKey.generateED25519(),
);

afterAll(() => client.close());

const [s1, s2] = [PrivateKey.generateED25519(), PrivateKey.generateED25519()] as const;
const [a1, a2, a3] = [
  PrivateKey.generateED25519(),
  PrivateKey.generateED25519(),
  PrivateKey.generateECDSA(),
] as const;
const submitKey = buildThresholdKey([s1.publicKey, s2.publicKey], 2, "submit");
const adminKey = buildThresholdKey([a1.publicKey, a2.publicKey, a3.publicKey], 2, "admin");

describe("buildCreateTopicTransaction", () => {
  it("sets the threshold KeyLists as the topic's submit key and admin key", () => {
    const tx = buildCreateTopicTransaction({ adminKey, submitKey, memo: "hcs-track-log" });
    const submit = tx.getSubmitKey();
    const admin = tx.getAdminKey();

    expect(submit).toBeInstanceOf(KeyList);
    expect(admin).toBeInstanceOf(KeyList);
    expect(isSameThresholdKey(submit, submitKey)).toBe(true);
    expect(isSameThresholdKey(admin, adminKey)).toBe(true);
    expect((admin as KeyList).threshold).toBe(2);
    expect(tx.getTopicMemo()).toBe("hcs-track-log");
  });
});

describe("prepareCreateTopicTransaction", () => {
  it("co-signs the creation with enough admin keys (the network requires the admin key to sign)", async () => {
    const tx = await prepareCreateTopicTransaction(client, {
      adminKey,
      submitKey,
      memo: "m",
      adminSigners: [a1, a3],
    });

    expect(tx.isFrozen()).toBe(true);
    expect(countSatisfiedSignatures(adminKey, tx)).toBe(2);
    expect(a2.publicKey.verifyTransaction(tx)).toBe(false);
  });

  it("refuses before signing when admin signers cannot meet the admin threshold", async () => {
    await expect(
      prepareCreateTopicTransaction(client, { adminKey, submitKey, memo: "m", adminSigners: [a1] }),
    ).rejects.toThrow(ThresholdKeyError);
    await expect(
      prepareCreateTopicTransaction(client, {
        adminKey,
        submitKey,
        memo: "m",
        adminSigners: [s1, s2],
      }),
    ).rejects.toThrow("admin-key signatures");
  });
});
