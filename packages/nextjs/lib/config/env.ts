/** Typed, validated readers for server-side configuration. Each reader requires only what it needs. */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

export const HEDERA_NETWORKS = ["testnet", "previewnet", "mainnet"] as const;
export type HederaNetwork = (typeof HEDERA_NETWORKS)[number];

const ENTITY_ID = /^\d+\.\d+\.\d+$/;

function required(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new ConfigError(`${key} is not set (see .env.example)`);
  return value;
}

function list(env: Env, key: string): string[] {
  const values = required(env, key)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (values.length === 0) throw new ConfigError(`${key} must list at least one value`);
  return values;
}

function entityId(env: Env, key: string): string {
  const value = required(env, key);
  if (!ENTITY_ID.test(value))
    throw new ConfigError(`${key} must look like 0.0.12345, got "${value}"`);
  return value;
}

export function readNetwork(env: Env = process.env): HederaNetwork {
  const value = env.HEDERA_NETWORK?.trim() || "testnet";
  if (!(HEDERA_NETWORKS as readonly string[]).includes(value)) {
    throw new ConfigError(
      `HEDERA_NETWORK must be one of ${HEDERA_NETWORKS.join(", ")}, got "${value}"`,
    );
  }
  return value as HederaNetwork;
}

export interface OperatorConfig {
  network: HederaNetwork;
  operatorId: string;
  operatorKey: string;
}

export function readOperatorConfig(env: Env = process.env): OperatorConfig {
  return {
    network: readNetwork(env),
    operatorId: entityId(env, "HEDERA_OPERATOR_ID"),
    operatorKey: required(env, "HEDERA_OPERATOR_KEY"),
  };
}

export interface SubmitKeyConfig {
  publicKeys: string[];
  threshold: number;
}

export function readSubmitKeyConfig(env: Env = process.env): SubmitKeyConfig {
  const publicKeys = list(env, "HCS_SUBMIT_PUBLIC_KEYS");
  const raw = env.HCS_SUBMIT_THRESHOLD?.trim() ?? "";
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new ConfigError(`HCS_SUBMIT_THRESHOLD must be a positive integer, got "${raw}"`);
  }
  return { publicKeys, threshold: Number(raw) };
}

export function readSignerKeys(env: Env = process.env): string[] {
  return list(env, "HCS_SUBMIT_SIGNER_KEYS");
}

export function readTopicId(env: Env = process.env): string {
  return entityId(env, "HCS_TOPIC_ID");
}

export function readMirrorNodeUrl(env: Env = process.env): string {
  const value = env.MIRROR_NODE_URL?.trim() || `https://${readNetwork(env)}.mirrornode.hedera.com`;
  try {
    new URL(value);
  } catch {
    throw new ConfigError(`MIRROR_NODE_URL must be an absolute URL, got "${value}"`);
  }
  return value.replace(/\/+$/, "");
}
