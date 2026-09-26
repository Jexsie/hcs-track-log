import { KeyList, PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import {
  SubmitKeyError,
  assertSignersSatisfy,
  buildSubmitKey,
  isSameSubmitKey,
} from "./submit-key";

const [a, b, c] = [
  PrivateKey.generateED25519().publicKey,
  PrivateKey.generateED25519().publicKey,
  PrivateKey.generateECDSA().publicKey,
] as const;
const pubs = [a, b, c];

describe("buildSubmitKey", () => {
  it("builds a threshold KeyList from the configured public keys", () => {
    const key = buildSubmitKey(pubs, 2);
    expect(key).toBeInstanceOf(KeyList);
    expect(key.threshold).toBe(2);
    expect(key.toArray()).toHaveLength(3);
  });

  it.each([
    ["a threshold of 1 (not multi-signature)", pubs, 1],
    ["a threshold above the key count", pubs, 4],
    ["a single key", pubs.slice(0, 1), 1],
  ])("rejects %s", (_label, list, threshold) => {
    expect(() => buildSubmitKey(list, threshold)).toThrow(SubmitKeyError);
  });

  it("rejects duplicate keys, which would let one signer count twice", () => {
    expect(() => buildSubmitKey([a, a, b], 2)).toThrow("duplicate");
  });
});

describe("assertSignersSatisfy", () => {
  const submitKey = buildSubmitKey(pubs, 2);

  it("accepts signers that meet the threshold", () => {
    expect(() => assertSignersSatisfy(submitKey, [a, c])).not.toThrow();
  });

  it("rejects too few signers", () => {
    expect(() => assertSignersSatisfy(submitKey, [b])).toThrow("1 of 2");
  });

  it("does not count keys outside the submit key or the same key twice", () => {
    const outsider = PrivateKey.generateED25519().publicKey;
    expect(() => assertSignersSatisfy(submitKey, [a, outsider])).toThrow(SubmitKeyError);
    expect(() => assertSignersSatisfy(submitKey, [a, a])).toThrow(SubmitKeyError);
  });
});

describe("isSameSubmitKey", () => {
  it("matches the same keys and threshold regardless of order", () => {
    expect(isSameSubmitKey(new KeyList([c, a, b], 2), buildSubmitKey(pubs, 2))).toBe(true);
  });

  it("detects a different threshold, key set, or a missing/single key", () => {
    const expected = buildSubmitKey(pubs, 2);
    expect(isSameSubmitKey(buildSubmitKey(pubs, 3), expected)).toBe(false);
    expect(isSameSubmitKey(buildSubmitKey(pubs.slice(0, 2), 2), expected)).toBe(false);
    expect(isSameSubmitKey(null, expected)).toBe(false);
    expect(isSameSubmitKey(a, expected)).toBe(false);
  });
});
