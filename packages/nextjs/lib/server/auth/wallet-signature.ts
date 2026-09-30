import type { PublicKey } from "@hiero-ledger/sdk";
import { decodeSignatureMap } from "@/lib/hedera/proto/hedera";

/** HIP-820 `hedera_signMessage`: wallets sign this prefix + length + message, never raw bytes. */
function prefixMessage(message: string): string {
  return `\x19Hedera Signed Message:\n${message.length}${message}`;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function fromBase64(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;

  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

/**
 * Verify a wallet's base64 SignatureMap over `message` for `publicKey`. The signature pair must
 * name exactly that key; any malformed input is simply "not verified".
 */
export function verifyWalletMessageSignature(
  message: string,
  signatureMap: string,
  publicKey: PublicKey,
): boolean {
  const bytes = fromBase64(signatureMap);

  if (!bytes) return false;
  let pairs;

  try {
    pairs = decodeSignatureMap(bytes);
  } catch {
    return false;
  }

  const expected = publicKey.toBytesRaw();
  const pair = pairs.find((p) => sameBytes(p.publicKey, expected));

  if (!pair) return false;

  try {
    return publicKey.verify(new TextEncoder().encode(prefixMessage(message)), pair.signature);
  } catch {
    return false;
  }
}
