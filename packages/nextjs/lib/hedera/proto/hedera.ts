import {
  ProtoDecodeError,
  optionalBytesField,
  readFields,
  repeatedBytesField,
  varintField,
} from "./wire";

export { ProtoDecodeError } from "./wire";

export type SimpleKeyType = "ed25519" | "ecdsa-secp256k1";

export interface SignaturePair {
  /** SignaturePair.pubKeyPrefix. Wallets send the full raw public key. */
  publicKey: Uint8Array;
  type: SimpleKeyType;
  signature: Uint8Array;
}

/** SignatureMap { repeated SignaturePair sigPair = 1 }: ed25519 = 3, ECDSA_secp256k1 = 6. */
export function decodeSignatureMap(bytes: Uint8Array): SignaturePair[] {
  return repeatedBytesField(bytes, 1).flatMap((pair): SignaturePair[] => {
    const publicKey = optionalBytesField(pair, 1) ?? new Uint8Array();
    const ed25519 = optionalBytesField(pair, 3);

    if (ed25519) return [{ publicKey, type: "ed25519", signature: ed25519 }];
    const ecdsa = optionalBytesField(pair, 6);

    if (ecdsa) return [{ publicKey, type: "ecdsa-secp256k1", signature: ecdsa }];

    return []; // contract / RSA / ECDSA-384 signatures are not used by wallets here
  });
}

export type DecodedKey =
  | { kind: SimpleKeyType; publicKey: Uint8Array }
  | { kind: "threshold"; threshold: number; keys: DecodedKey[] }
  | { kind: "keyList"; keys: DecodedKey[] }
  | { kind: "unsupported" };

const MAX_KEY_DEPTH = 8;

/** Key { ed25519 = 2; thresholdKey = 5; keyList = 6; ECDSA_secp256k1 = 7 } */
export function decodeKey(bytes: Uint8Array, depth = 0): DecodedKey {
  if (depth > MAX_KEY_DEPTH) throw new ProtoDecodeError("key nesting too deep");
  const field = readFields(bytes).find((f) => f.bytes !== undefined);

  if (!field?.bytes) return { kind: "unsupported" };
  const list = (keyListBytes: Uint8Array) =>
    repeatedBytesField(keyListBytes, 1).map((k) => decodeKey(k, depth + 1));

  switch (field.number) {
    case 2:
      return { kind: "ed25519", publicKey: field.bytes };
    case 7:
      return { kind: "ecdsa-secp256k1", publicKey: field.bytes };
    case 5:
      return {
        kind: "threshold",
        threshold: Number(varintField(field.bytes, 1) ?? 0n),
        keys: list(optionalBytesField(field.bytes, 2) ?? new Uint8Array()),
      };
    case 6:
      return { kind: "keyList", keys: list(field.bytes) };
    default:
      return { kind: "unsupported" };
  }
}

export interface ScheduledTopicMessage {
  topicId: string;
  message: Uint8Array;
}

/**
 * SchedulableTransactionBody.consensusSubmitMessage (21) → { topicID (1), message (2) };
 * TopicID { shardNum = 1, realmNum = 2, topicNum = 3 }. Null if the schedule is anything else.
 */
export function decodeScheduledTopicMessage(
  schedulableBody: Uint8Array,
): ScheduledTopicMessage | null {
  const submit = optionalBytesField(schedulableBody, 21);

  if (!submit) return null;
  const topic = optionalBytesField(submit, 1);
  const message = optionalBytesField(submit, 2) ?? new Uint8Array();

  if (!topic) throw new ProtoDecodeError("scheduled topic message has no topic");
  const part = (n: number) => (varintField(topic, n) ?? 0n).toString();

  return { topicId: `${part(1)}.${part(2)}.${part(3)}`, message };
}
