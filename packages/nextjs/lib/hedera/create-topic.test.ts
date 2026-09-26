import { KeyList, PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { buildCreateTopicTransaction } from "./create-topic";
import { buildSubmitKey } from "./submit-key";

const pubs = [PrivateKey.generateED25519(), PrivateKey.generateED25519()].map((k) => k.publicKey);

describe("buildCreateTopicTransaction", () => {
  it("sets the threshold KeyList as the topic submit key", () => {
    const submitKey = buildSubmitKey(pubs, 2);
    const tx = buildCreateTopicTransaction({ submitKey, memo: "hcs-track-log" });
    const key = tx.getSubmitKey();
    expect(key).toBeInstanceOf(KeyList);
    expect((key as KeyList).threshold).toBe(2);
    expect(tx.getTopicMemo()).toBe("hcs-track-log");
  });

  it("sets no admin key, so the submit key cannot be swapped by a single party", () => {
    const tx = buildCreateTopicTransaction({ submitKey: buildSubmitKey(pubs, 2), memo: "m" });
    expect(tx.getAdminKey()).toBeNull();
  });
});
