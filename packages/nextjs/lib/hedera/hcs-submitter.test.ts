import { AccountId, Client, PrivateKey, TopicId } from "@hiero-ledger/sdk";
import { afterAll, describe, expect, it } from "vitest";
import { HcsEnvelopeSubmitter } from "./hcs-submitter";
import { SubmitKeyError, buildSubmitKey, countSatisfiedSignatures } from "./submit-key";

// Offline: freezing and signing needs a client for node ids and a transaction id, but no network I/O.
const operatorKey = PrivateKey.generateED25519();
const client = Client.forTestnet().setOperator(AccountId.fromString("0.0.1001"), operatorKey);
afterAll(() => client.close());

const topicId = TopicId.fromString("0.0.5005");
const [first, second, outsider] = [
  PrivateKey.generateED25519(),
  PrivateKey.generateED25519(),
  PrivateKey.generateECDSA(),
] as const;
const signers = [first, second, outsider];
const submitKey = buildSubmitKey(
  signers.map((k) => k.publicKey),
  2,
);
const message = new TextEncoder().encode('{"parcelHash":"a","payloadHash":"b","v":1}');

describe("HcsEnvelopeSubmitter", () => {
  it("refuses to start with signers that cannot meet the topic's threshold", () => {
    expect(
      () => new HcsEnvelopeSubmitter({ client, topicId, submitKey, signers: signers.slice(0, 1) }),
    ).toThrow(SubmitKeyError);
  });

  it("produces a single-chunk transaction signed by enough submit-key holders", async () => {
    const submitter = new HcsEnvelopeSubmitter({
      client,
      topicId,
      submitKey,
      signers: signers.slice(0, 2),
    });
    const tx = await submitter.prepare(message);

    expect(tx.isFrozen()).toBe(true);
    expect(tx.topicId?.toString()).toBe("0.0.5005");
    expect(tx.getMaxChunks()).toBe(1);
    expect(countSatisfiedSignatures(submitKey, tx)).toBe(2);
    expect(outsider.publicKey.verifyTransaction(tx)).toBe(false);
  });

  it("a transaction signed below the threshold does not satisfy the submit key", async () => {
    const submitter = new HcsEnvelopeSubmitter({
      client,
      topicId,
      submitKey,
      signers: signers.slice(0, 2),
    });
    const tx = await submitter.prepare(message);
    tx.removeSignature(second.publicKey);
    expect(countSatisfiedSignatures(submitKey, tx)).toBe(1);
  });
});
