import { describe, expect, it } from "vitest";
import {
  HEDERA_METHODS,
  hederaAccountFromSession,
  requiredNamespaces,
  signAndExecuteRequest,
  signMessageRequest,
} from "./hip820";

describe("HIP-820 wire format", () => {
  it("asks wallets for the hedera namespace on the configured chain", () => {
    expect(requiredNamespaces("testnet")).toEqual({
      hedera: {
        chains: ["hedera:testnet"],
        methods: ["hedera_signMessage", "hedera_signAndExecuteTransaction"],
        events: ["accountsChanged", "chainChanged"],
      },
    });
    expect(HEDERA_METHODS).toContain("hedera_signMessage");
  });

  it("builds hedera_signMessage with a HIP-30 signer id", () => {
    expect(signMessageRequest("topic-1", "testnet", "0.0.100", "hello")).toEqual({
      topic: "topic-1",
      chainId: "hedera:testnet",
      request: {
        method: "hedera_signMessage",
        params: { signerAccountId: "hedera:testnet:0.0.100", message: "hello" },
      },
    });
  });

  it("builds hedera_signAndExecuteTransaction with a base64 transactionList", () => {
    expect(signAndExecuteRequest("topic-1", "mainnet", "0.0.7", "AAEC")).toEqual({
      topic: "topic-1",
      chainId: "hedera:mainnet",
      request: {
        method: "hedera_signAndExecuteTransaction",
        params: { signerAccountId: "hedera:mainnet:0.0.7", transactionList: "AAEC" },
      },
    });
  });

  it("reads the connected account for the configured chain only", () => {
    const session = {
      namespaces: { hedera: { accounts: ["hedera:mainnet:0.0.9", "hedera:testnet:0.0.100"] } },
    };
    expect(hederaAccountFromSession(session, "testnet")).toBe("0.0.100");
    expect(hederaAccountFromSession(session, "previewnet")).toBeNull();
    expect(hederaAccountFromSession({ namespaces: {} }, "testnet")).toBeNull();
    expect(
      hederaAccountFromSession(
        { namespaces: { hedera: { accounts: ["hedera:testnet:evil"] } } },
        "testnet",
      ),
    ).toBeNull();
  });
});
