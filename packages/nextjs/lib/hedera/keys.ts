import { PrivateKey, PublicKey } from "@hiero-ledger/sdk";
import { ConfigError } from "@/lib/config/env";

/**
 * Keys are accepted DER-encoded (ED25519 or ECDSA, as shown in the Hedera portal) or as
 * 0x-prefixed raw hex, which is interpreted as ECDSA(secp256k1).
 */
export function parsePrivateKey(value: string, label: string): PrivateKey {
  try {
    return value.startsWith("0x")
      ? PrivateKey.fromStringECDSA(value.slice(2))
      : PrivateKey.fromStringDer(value);
  } catch {
    throw new ConfigError(`${label} is not a valid DER or 0x-hex ECDSA private key`);
  }
}

export function parsePublicKey(value: string, label: string): PublicKey {
  try {
    return value.startsWith("0x")
      ? PublicKey.fromStringECDSA(value.slice(2))
      : PublicKey.fromString(value);
  } catch {
    throw new ConfigError(`${label} is not a valid DER or 0x-hex ECDSA public key`);
  }
}
