import { type Key, KeyList, type PrivateKey, PublicKey } from "@hiero-ledger/sdk";
import type { KeyRole, ThresholdKeyConfig } from "@/lib/server/config/env";
import { parsePrivateKey, parsePublicKey } from "./keys";

export class ThresholdKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThresholdKeyError";
  }
}

const der = (key: PublicKey) => key.toStringDer();
const envPrefix = (role: KeyRole) => `HCS_${role.toUpperCase()}`;

/**
 * A topic key (submit or admin) as a flat threshold KeyList: at least two keys and a threshold of
 * at least two, so no single party can write to, or reconfigure, the log.
 */
function buildThresholdKey(
  publicKeys: readonly PublicKey[],
  threshold: number,
  role: KeyRole,
): KeyList {
  if (publicKeys.length < 2) {
    throw new ThresholdKeyError(`a multi-signature ${role} key needs at least 2 public keys`);
  }

  if (new Set(publicKeys.map(der)).size !== publicKeys.length) {
    throw new ThresholdKeyError(`${role} key contains duplicate public keys`);
  }

  if (!Number.isInteger(threshold) || threshold < 2 || threshold > publicKeys.length) {
    throw new ThresholdKeyError(
      `${role} key threshold must be between 2 and ${publicKeys.length}, got ${threshold}`,
    );
  }

  return new KeyList([...publicKeys], threshold);
}

/** Build a threshold key from env configuration; bad entries are named by variable and index. */
export function parseThresholdKey(
  { publicKeys, threshold }: ThresholdKeyConfig,
  role: KeyRole,
): KeyList {
  return buildThresholdKey(
    publicKeys.map((k, i) => parsePublicKey(k, `${envPrefix(role)}_PUBLIC_KEYS[${i}]`)),
    threshold,
    role,
  );
}

export function parseSignerKeys(values: readonly string[], role: KeyRole): PrivateKey[] {
  return values.map((k, i) => parsePrivateKey(k, `${envPrefix(role)}_SIGNER_KEYS[${i}]`));
}

function members(key: KeyList): PublicKey[] {
  return key.toArray().filter((k): k is PublicKey => k instanceof PublicKey);
}

function requiredSignatures(key: KeyList): number {
  return key.threshold ?? key.toArray().length;
}

/** Fail fast (before paying fees) if `signers` cannot meet the key's threshold. */
export function assertSignersSatisfy(
  key: KeyList,
  signers: readonly PublicKey[],
  role: KeyRole,
): void {
  const allowed = new Set(members(key).map(der));
  const distinct = new Set(signers.map(der).filter((k) => allowed.has(k)));
  const needed = requiredSignatures(key);

  if (distinct.size < needed) {
    throw new ThresholdKeyError(
      `configured signers satisfy ${distinct.size} of ${needed} required ${role}-key signatures`,
    );
  }
}

/** True when `actual` (e.g. from TopicInfoQuery) is the same threshold KeyList as `expected`. */
export function isSameThresholdKey(actual: Key | null, expected: KeyList): boolean {
  if (!(actual instanceof KeyList)) return false;
  if (requiredSignatures(actual) !== requiredSignatures(expected)) return false;
  const a = members(actual).map(der).sort();
  const b = members(expected).map(der).sort();

  return (
    a.length === actual.toArray().length && a.length === b.length && a.every((k, i) => k === b[i])
  );
}

/**
 * The operator pays for (and therefore signs) every ScheduleCreate, and Hedera counts those
 * signatures toward the scheduled transaction. If the operator's key were a submit key, the server
 * would silently provide one approval on every proposal, so fewer humans than the threshold could
 * publish. Refuse that configuration.
 */
export function assertOperatorNotSubmitter(operatorKey: PublicKey, submitKey: KeyList): void {
  if (members(submitKey).some((k) => k.equals(operatorKey))) {
    throw new ThresholdKeyError(
      "the operator's key must not be one of the topic's submit keys: it signs every schedule it pays for, " +
        "which would count as an approval. Use a separate operator account.",
    );
  }
}
