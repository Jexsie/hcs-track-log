import { PrivateKey, type PublicKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { walletSign } from "@/test/wallet-signing";
import { signInWithWallet } from "./sign-in";
import { AuthError, issueChallenge } from "./tokens";

const SECRET = "s".repeat(40);
const now = new Date("2026-09-28T10:00:00Z");
const [alice, bob, mallory] = [
  PrivateKey.generateED25519(),
  PrivateKey.generateECDSA(),
  PrivateKey.generateED25519(),
] as const;
const submitKeys = [alice.publicKey, bob.publicKey];
const accountKeys: Record<string, PublicKey> = {
  "0.0.100": alice.publicKey,
  "0.0.200": bob.publicKey,
  "0.0.666": mallory.publicKey,
};
const deps = {
  secret: SECRET,
  now: () => now,
  submitKeys,
  resolveAccountKey: async (id: string) =>
    accountKeys[id] ?? Promise.reject(new Error("no account")),
};

async function attempt(accountId: string, signer: PrivateKey, tamper?: (t: string) => string) {
  const { message, token } = issueChallenge({
    accountId,
    domain: "localhost",
    secret: SECRET,
    now,
  });

  return signInWithWallet(
    {
      accountId,
      token: tamper ? tamper(token) : token,
      signatureMap: await walletSign(signer, message),
    },
    deps,
  );
}

describe("signInWithWallet", () => {
  it("signs in an account whose on-chain key is a topic submit key (ED25519 and ECDSA)", async () => {
    expect(await attempt("0.0.100", alice)).toEqual({
      accountId: "0.0.100",
      publicKey: alice.publicKey.toStringDer(),
    });
    expect((await attempt("0.0.200", bob)).accountId).toBe("0.0.200");
  });

  it("refuses an account that is not a submitter, even with a valid signature", async () => {
    await expect(attempt("0.0.666", mallory)).rejects.toMatchObject({ code: "NOT_A_SUBMITTER" });
  });

  it("refuses a signature by a different key than the account's", async () => {
    await expect(attempt("0.0.100", bob)).rejects.toMatchObject({ code: "BAD_SIGNATURE" });
  });

  it("refuses a challenge issued for another account or tampered with", async () => {
    const { message, token } = issueChallenge({
      accountId: "0.0.200",
      domain: "localhost",
      secret: SECRET,
      now,
    });

    await expect(
      signInWithWallet(
        { accountId: "0.0.100", token, signatureMap: await walletSign(alice, message) },
        deps,
      ),
    ).rejects.toMatchObject({ code: "BAD_CHALLENGE" });
    await expect(attempt("0.0.100", alice, (t) => `x${t}`)).rejects.toBeInstanceOf(AuthError);
  });

  it("reports an unknown account", async () => {
    await expect(attempt("0.0.999", alice)).rejects.toMatchObject({ code: "UNKNOWN_ACCOUNT" });
  });
});
