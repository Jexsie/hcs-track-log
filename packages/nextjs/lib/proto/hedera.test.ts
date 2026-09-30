import {
  AccountId,
  KeyList,
  PrivateKey,
  PublicKey,
  ScheduleCreateTransaction,
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
  TransactionId,
} from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import {
  ProtoDecodeError,
  decodeKey,
  decodeScheduledTopicMessage,
  decodeSignatureMap,
} from "./hedera";
import { bytesField, messageField } from "./wire";

/* Reference bytes come from the real SDK, so the decoders are checked against its encoder. */
const NODE = [AccountId.fromString("0.0.3")];
const txId = () => TransactionId.generate(AccountId.fromString("0.0.1001"));

/** TransactionList → Transaction → SignedTransaction, as the SDK serializes a frozen transaction. */
function signedParts(bytes: Uint8Array) {
  const transaction = messageField(bytes, 1);
  const signed = bytesField(transaction, 5);

  return { bodyBytes: bytesField(signed, 1), sigMap: bytesField(signed, 2) };
}

describe("decodeSignatureMap", () => {
  it("decodes an SDK-produced SignatureMap whose pairs verify over the body bytes", async () => {
    const ed = PrivateKey.generateED25519();
    const ec = PrivateKey.generateECDSA();
    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString("0.0.5005"))
      .setMessage("x")
      .setNodeAccountIds(NODE)
      .setTransactionId(txId())
      .freeze();

    await tx.sign(ed);
    await tx.sign(ec);

    const { bodyBytes, sigMap } = signedParts(tx.toBytes());
    const pairs = decodeSignatureMap(sigMap);

    expect(pairs).toHaveLength(2);

    for (const pair of pairs) {
      const key =
        pair.type === "ed25519"
          ? PublicKey.fromBytesED25519(pair.publicKey)
          : PublicKey.fromBytesECDSA(pair.publicKey);

      expect(key.verify(bodyBytes, pair.signature)).toBe(true);
    }

    expect(pairs.map((p) => p.type).sort()).toEqual(["ecdsa-secp256k1", "ed25519"]);
  });

  it("rejects truncated or malformed input", () => {
    expect(() => decodeSignatureMap(new Uint8Array([0x0a, 0x05, 0x01]))).toThrow(ProtoDecodeError);
    expect(() =>
      decodeSignatureMap(
        new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]),
      ),
    ).toThrow(ProtoDecodeError);
  });
});

describe("decodeKey", () => {
  it("decodes an SDK-encoded threshold KeyList (topic submit key)", () => {
    const keys = [
      PrivateKey.generateED25519().publicKey,
      PrivateKey.generateECDSA().publicKey,
      PrivateKey.generateED25519().publicKey,
    ];
    const tx = new TopicCreateTransaction()
      .setSubmitKey(new KeyList(keys, 2))
      .setNodeAccountIds(NODE)
      .setTransactionId(txId())
      .freeze();
    const { bodyBytes } = signedParts(tx.toBytes());
    const submitKey = bytesField(bytesField(bodyBytes, 24), 3); // TransactionBody.consensusCreateTopic.submitKey

    const decoded = decodeKey(submitKey);

    expect(decoded.kind).toBe("threshold");
    if (decoded.kind !== "threshold") return;
    expect(decoded.threshold).toBe(2);
    expect(
      decoded.keys.map((k) =>
        k.kind === "ed25519" || k.kind === "ecdsa-secp256k1" ? k.kind : "other",
      ),
    ).toEqual(["ed25519", "ecdsa-secp256k1", "ed25519"]);
    const raw = decoded.keys.map((k) =>
      "publicKey" in k ? Buffer.from(k.publicKey).toString("hex") : "",
    );

    expect(raw).toEqual(keys.map((k) => k.toStringRaw()));
  });
});

describe("decodeScheduledTopicMessage", () => {
  it("extracts the topic and message from an SDK-built schedule (what the mirror node serves)", () => {
    const envelope = new TextEncoder().encode('{"parcelHash":"a","payloadHash":"b","v":1}');
    const tx = new ScheduleCreateTransaction()
      .setScheduledTransaction(
        new TopicMessageSubmitTransaction()
          .setTopicId(TopicId.fromString("0.0.5005"))
          .setMessage(envelope),
      )
      .setNodeAccountIds(NODE)
      .setTransactionId(txId())
      .freeze();
    const { bodyBytes } = signedParts(tx.toBytes());
    const schedulable = bytesField(bytesField(bodyBytes, 42), 1); // TransactionBody.scheduleCreate.scheduledTransactionBody

    expect(decodeScheduledTopicMessage(schedulable)).toEqual({
      topicId: "0.0.5005",
      message: envelope,
    });
  });

  it("returns null for a scheduled transaction that is not a topic message", () => {
    // SchedulableTransactionBody with only transactionFee (1) and memo (2)
    expect(decodeScheduledTopicMessage(new Uint8Array([0x08, 0x01, 0x12, 0x01, 0x78]))).toBeNull();
  });
});
