import { describe, expect, it } from "vitest";
import {
  ConfigError,
  readMirrorNodeUrl,
  readOperatorConfig,
  readSignerKeys,
  readSubmitKeyConfig,
  readTopicId,
} from "./env";

const env = (vars: Record<string, string>) => vars;

describe("readOperatorConfig", () => {
  it("reads network, operator id and key", () => {
    expect(
      readOperatorConfig(
        env({
          HEDERA_NETWORK: "testnet",
          HEDERA_OPERATOR_ID: "0.0.1234",
          HEDERA_OPERATOR_KEY: "302e",
        }),
      ),
    ).toEqual({ network: "testnet", operatorId: "0.0.1234", operatorKey: "302e" });
  });

  it("defaults the network to testnet", () => {
    expect(
      readOperatorConfig(env({ HEDERA_OPERATOR_ID: "0.0.1", HEDERA_OPERATOR_KEY: "k" })).network,
    ).toBe("testnet");
  });

  it("names every missing variable", () => {
    expect(() => readOperatorConfig(env({}))).toThrow(ConfigError);
    expect(() => readOperatorConfig(env({}))).toThrow("HEDERA_OPERATOR_ID");
    expect(() => readOperatorConfig(env({ HEDERA_OPERATOR_ID: "0.0.1" }))).toThrow(
      "HEDERA_OPERATOR_KEY",
    );
  });

  it("rejects an unknown network and a malformed account id", () => {
    expect(() =>
      readOperatorConfig(
        env({ HEDERA_NETWORK: "devnet", HEDERA_OPERATOR_ID: "0.0.1", HEDERA_OPERATOR_KEY: "k" }),
      ),
    ).toThrow("HEDERA_NETWORK");
    expect(() =>
      readOperatorConfig(env({ HEDERA_OPERATOR_ID: "1234", HEDERA_OPERATOR_KEY: "k" })),
    ).toThrow("HEDERA_OPERATOR_ID");
  });
});

describe("readSubmitKeyConfig", () => {
  it("splits comma-separated public keys and parses the threshold", () => {
    expect(
      readSubmitKeyConfig(env({ HCS_SUBMIT_PUBLIC_KEYS: " a, b ,c ", HCS_SUBMIT_THRESHOLD: "2" })),
    ).toEqual({
      publicKeys: ["a", "b", "c"],
      threshold: 2,
    });
  });

  it.each(["", "0", "-1", "1.5", "two"])("rejects threshold %j", (threshold) => {
    expect(() =>
      readSubmitKeyConfig(env({ HCS_SUBMIT_PUBLIC_KEYS: "a,b", HCS_SUBMIT_THRESHOLD: threshold })),
    ).toThrow("HCS_SUBMIT_THRESHOLD");
  });

  it("rejects an empty key list", () => {
    expect(() =>
      readSubmitKeyConfig(env({ HCS_SUBMIT_PUBLIC_KEYS: " , ", HCS_SUBMIT_THRESHOLD: "1" })),
    ).toThrow("HCS_SUBMIT_PUBLIC_KEYS");
  });
});

describe("other readers", () => {
  it("reads signer keys and topic id", () => {
    expect(readSignerKeys(env({ HCS_SUBMIT_SIGNER_KEYS: "x,y" }))).toEqual(["x", "y"]);
    expect(readTopicId(env({ HCS_TOPIC_ID: "0.0.42" }))).toBe("0.0.42");
    expect(() => readTopicId(env({ HCS_TOPIC_ID: "0.0.xxxxxx" }))).toThrow("HCS_TOPIC_ID");
  });

  it("defaults the mirror node from the network and strips trailing slashes", () => {
    expect(readMirrorNodeUrl(env({}))).toBe("https://testnet.mirrornode.hedera.com");
    expect(readMirrorNodeUrl(env({ HEDERA_NETWORK: "mainnet" }))).toBe(
      "https://mainnet.mirrornode.hedera.com",
    );
    expect(readMirrorNodeUrl(env({ MIRROR_NODE_URL: "http://localhost:5551/" }))).toBe(
      "http://localhost:5551",
    );
    expect(() => readMirrorNodeUrl(env({ MIRROR_NODE_URL: "not a url" }))).toThrow(
      "MIRROR_NODE_URL",
    );
  });
});
