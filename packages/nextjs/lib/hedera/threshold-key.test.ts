import { KeyList, PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import {
  ThresholdKeyError,
  assertSignersSatisfy,
  buildThresholdKey,
  isSameThresholdKey,
  parseSignerKeys,
  parseThresholdKey,
} from "./threshold-key";

const [ka, kb, kc] = [
  PrivateKey.generateED25519(),
  PrivateKey.generateED25519(),
  PrivateKey.generateECDSA(),
] as const;
const [a, b, c] = [ka.publicKey, kb.publicKey, kc.publicKey] as const;
const pubs = [a, b, c];

describe.each(["submit", "admin"] as const)("buildThresholdKey (%s)", (role) => {
  it("builds a threshold KeyList from the configured public keys", () => {
    const key = buildThresholdKey(pubs, 2, role);
    expect(key).toBeInstanceOf(KeyList);
    expect(key.threshold).toBe(2);
    expect(key.toArray()).toHaveLength(3);
  });

  it.each([
    ["a threshold of 1 (not multi-signature)", pubs, 1],
    ["a threshold above the key count", pubs, 4],
    ["a single key", [a], 1],
  ])("rejects %s, naming the role", (_label, list, threshold) => {
    expect(() => buildThresholdKey(list, threshold, role)).toThrow(ThresholdKeyError);
    expect(() => buildThresholdKey(list, threshold, role)).toThrow(`${role} key`);
  });

  it("rejects duplicate keys, which would let one signer count twice", () => {
    expect(() => buildThresholdKey([a, a, b], 2, role)).toThrow("duplicate");
  });
});

describe("assertSignersSatisfy", () => {
  const key = buildThresholdKey(pubs, 2, "admin");

  it("accepts signers that meet the threshold", () => {
    expect(() => assertSignersSatisfy(key, [a, c], "admin")).not.toThrow();
  });

  it("rejects too few signers, naming the role", () => {
    expect(() => assertSignersSatisfy(key, [b], "admin")).toThrow(
      "1 of 2 required admin-key signatures",
    );
  });

  it("does not count keys outside the key list or the same key twice", () => {
    const outsider = PrivateKey.generateED25519().publicKey;
    expect(() => assertSignersSatisfy(key, [a, outsider], "admin")).toThrow(ThresholdKeyError);
    expect(() => assertSignersSatisfy(key, [a, a], "admin")).toThrow(ThresholdKeyError);
  });
});

describe("isSameThresholdKey", () => {
  it("matches the same keys and threshold regardless of order", () => {
    expect(
      isSameThresholdKey(new KeyList([c, a, b], 2), buildThresholdKey(pubs, 2, "submit")),
    ).toBe(true);
  });

  it("detects a different threshold, key set, or a missing/single key", () => {
    const expected = buildThresholdKey(pubs, 2, "submit");
    expect(isSameThresholdKey(buildThresholdKey(pubs, 3, "submit"), expected)).toBe(false);
    expect(isSameThresholdKey(buildThresholdKey([a, b], 2, "submit"), expected)).toBe(false);
    expect(isSameThresholdKey(null, expected)).toBe(false);
    expect(isSameThresholdKey(a, expected)).toBe(false);
  });
});

describe("parsing from configuration", () => {
  it("parses DER public keys into a threshold key and labels bad entries by env var", () => {
    const key = parseThresholdKey(
      { publicKeys: pubs.map((k) => k.toStringDer()), threshold: 2 },
      "admin",
    );
    expect(isSameThresholdKey(key, buildThresholdKey(pubs, 2, "admin"))).toBe(true);
    expect(() =>
      parseThresholdKey({ publicKeys: ["nope", a.toStringDer()], threshold: 2 }, "admin"),
    ).toThrow("HCS_ADMIN_PUBLIC_KEYS[0]");
  });

  it("parses signer private keys and labels bad entries by env var", () => {
    expect(parseSignerKeys([ka.toStringDer()], "submit")[0]?.publicKey.equals(a)).toBe(true);
    expect(() => parseSignerKeys(["bad"], "submit")).toThrow("HCS_SUBMIT_SIGNER_KEYS[0]");
  });
});
