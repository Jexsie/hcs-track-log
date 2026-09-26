import { type Key, KeyList, PublicKey, type Transaction } from "@hiero-ledger/sdk";

export class SubmitKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmitKeyError";
  }
}

const der = (key: PublicKey) => key.toStringDer();

/**
 * The topic's submit key: a flat threshold KeyList. At least two keys and a threshold of at least
 * two, so no single party can write to the log.
 */
export function buildSubmitKey(publicKeys: readonly PublicKey[], threshold: number): KeyList {
  if (publicKeys.length < 2)
    throw new SubmitKeyError("a multi-signature submit key needs at least 2 public keys");
  if (new Set(publicKeys.map(der)).size !== publicKeys.length) {
    throw new SubmitKeyError("submit key contains duplicate public keys");
  }
  if (!Number.isInteger(threshold) || threshold < 2 || threshold > publicKeys.length) {
    throw new SubmitKeyError(
      `threshold must be between 2 and ${publicKeys.length}, got ${threshold}`,
    );
  }
  return new KeyList([...publicKeys], threshold);
}

function members(submitKey: KeyList): PublicKey[] {
  return submitKey.toArray().filter((k): k is PublicKey => k instanceof PublicKey);
}

function requiredSignatures(submitKey: KeyList): number {
  return submitKey.threshold ?? submitKey.toArray().length;
}

/** Fail fast (before paying fees) if `signers` cannot meet the submit key's threshold. */
export function assertSignersSatisfy(submitKey: KeyList, signers: readonly PublicKey[]): void {
  const allowed = new Set(members(submitKey).map(der));
  const distinct = new Set(signers.map(der).filter((k) => allowed.has(k)));
  const needed = requiredSignatures(submitKey);
  if (distinct.size < needed) {
    throw new SubmitKeyError(
      `configured signers satisfy ${distinct.size} of ${needed} required submit-key signatures`,
    );
  }
}

/** How many submit-key members have validly signed `transaction`. Mirrors the network's check. */
export function countSatisfiedSignatures(submitKey: KeyList, transaction: Transaction): number {
  return members(submitKey).filter((key) => key.verifyTransaction(transaction)).length;
}

/** True when `actual` (e.g. from TopicInfoQuery) is the same threshold KeyList as `expected`. */
export function isSameSubmitKey(actual: Key | null, expected: KeyList): boolean {
  if (!(actual instanceof KeyList)) return false;
  if (requiredSignatures(actual) !== requiredSignatures(expected)) return false;
  const a = members(actual).map(der).sort();
  const b = members(expected).map(der).sort();
  return (
    a.length === actual.toArray().length && a.length === b.length && a.every((k, i) => k === b[i])
  );
}
