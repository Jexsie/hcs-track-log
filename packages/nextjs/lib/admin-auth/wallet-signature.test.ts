import { PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { walletSign } from "@/test/wallet-signing";
import { prefixMessage, verifyWalletMessageSignature } from "./wallet-signature";

describe("prefixMessage (HIP-820)", () => {
  it("prefixes with the Hedera signed-message header and the length", () => {
    expect(prefixMessage("hello")).toBe("\x19Hedera Signed Message:\n5hello");
  });
});

describe.each([
  ["ED25519", () => PrivateKey.generateED25519()],
  ["ECDSA", () => PrivateKey.generateECDSA()],
])("verifyWalletMessageSignature (%s)", (_type, generate) => {
  const key = generate();
  const message = "hcs-track-log administrator sign-in\nNonce: abc";

  it("accepts the wallet's signature over the prefixed message", async () => {
    expect(
      verifyWalletMessageSignature(message, await walletSign(key, message), key.publicKey),
    ).toBe(true);
  });

  it("rejects a signature for a different message, key, or a malformed map", async () => {
    expect(
      verifyWalletMessageSignature("other", await walletSign(key, message), key.publicKey),
    ).toBe(false);
    expect(
      verifyWalletMessageSignature(message, await walletSign(generate(), message), key.publicKey),
    ).toBe(false);
    expect(verifyWalletMessageSignature(message, "not base64 !!", key.publicKey)).toBe(false);
    expect(verifyWalletMessageSignature(message, "", key.publicKey)).toBe(false);
  });
});
