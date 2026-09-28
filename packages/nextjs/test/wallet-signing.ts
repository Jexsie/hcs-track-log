import type { PrivateKey } from "@hiero-ledger/sdk";
import { prefixMessage } from "@/lib/admin-auth/wallet-signature";

/** Minimal protobuf writers used only to fake what a wallet returns from hedera_signMessage. */
function varint(n: number): number[] {
  const out: number[] = [];
  let v = n;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}
const lenField = (field: number, bytes: Uint8Array) => [
  ...varint((field << 3) | 2),
  ...varint(bytes.length),
  ...bytes,
];

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
