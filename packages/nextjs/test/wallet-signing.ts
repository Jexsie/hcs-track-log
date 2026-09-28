import type { PrivateKey } from "@hiero-ledger/sdk";
import { prefixMessage } from "@/lib/admin-auth/wallet-signature";
import { lenField } from "./proto-writer";

/** Sign like a HIP-820 wallet: prefixed message, SignatureMap{ sigPair{ pubKeyPrefix, ed25519|ECDSA } }. */
export async function walletSign(key: PrivateKey, message: string): Promise<string> {
  const signature = await key.sign(new TextEncoder().encode(prefixMessage(message)));
  const sigField = key.type === "ED25519" ? 3 : 6;
  const pair = new Uint8Array([
    ...lenField(1, key.publicKey.toBytesRaw()),
    ...lenField(sigField, signature),
  ]);
  return Buffer.from(new Uint8Array(lenField(1, pair))).toString("base64");
}
