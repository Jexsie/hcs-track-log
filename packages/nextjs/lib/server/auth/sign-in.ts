import type { PublicKey } from "@hiero-ledger/sdk";
import { type AdminIdentity, AuthError, verifyChallenge } from "./tokens";
import { verifyWalletMessageSignature } from "./wallet-signature";

export interface SignInDeps {
  secret: string;
  now: () => Date;
  /** Members of the topic's threshold submit key. */
  submitKeys: readonly PublicKey[];
  /** The account's CURRENT key, from the mirror node (authoritative, not client-supplied). */
  resolveAccountKey: (accountId: string) => Promise<PublicKey>;
}

/**
 * Wallet sign-in: the challenge must be ours and fresh, the signature must be by the account's
 * on-chain key, and that key must be one of the topic's submit keys.
 */
export async function signInWithWallet(
  input: { accountId: string; token: string; signatureMap: string },
  { secret, now, submitKeys, resolveAccountKey }: SignInDeps,
): Promise<AdminIdentity> {
  const challenge = verifyChallenge(input.token, secret, now());

  if (challenge.accountId !== input.accountId) {
    throw new AuthError("BAD_CHALLENGE", "challenge was issued for a different account");
  }

  let accountKey: PublicKey;

  try {
    accountKey = await resolveAccountKey(input.accountId);
  } catch {
    throw new AuthError(
      "UNKNOWN_ACCOUNT",
      `could not resolve the key of account ${input.accountId}`,
    );
  }

  if (!verifyWalletMessageSignature(challenge.message, input.signatureMap, accountKey)) {
    throw new AuthError("BAD_SIGNATURE", "signature does not match this account's key");
  }

  if (!submitKeys.some((k) => k.equals(accountKey))) {
    throw new AuthError(
      "NOT_A_SUBMITTER",
      "this account's key is not one of the topic's submit keys",
    );
  }

  return { accountId: input.accountId, publicKey: accountKey.toStringDer() };
}
