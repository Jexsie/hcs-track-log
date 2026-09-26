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

/** The topic's two threshold keys: `submit` gates writes, `admin` gates topic updates/deletion. */
export type KeyRole = "submit" | "admin";

export interface ThresholdKeyConfig {
  publicKeys: string[];
  threshold: number;
}

/** HCS_{SUBMIT|ADMIN}_PUBLIC_KEYS + HCS_{SUBMIT|ADMIN}_THRESHOLD */
export function readKeyConfig(role: KeyRole, env: Env = process.env): ThresholdKeyConfig {
  const prefix = `HCS_${role.toUpperCase()}`;
  const publicKeys = list(env, `${prefix}_PUBLIC_KEYS`);
  const raw = env[`${prefix}_THRESHOLD`]?.trim() ?? "";
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new ConfigError(`${prefix}_THRESHOLD must be a positive integer, got "${raw}"`);
  }
  return { publicKeys, threshold: Number(raw) };
}

/** HCS_{SUBMIT|ADMIN}_SIGNER_KEYS: private keys this process signs with for that role. */
export function readSignerKeys(role: KeyRole, env: Env = process.env): string[] {
  return list(env, `HCS_${role.toUpperCase()}_SIGNER_KEYS`);
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

export function readDatabaseUrl(env: Env = process.env, key = "DATABASE_URL"): string {
  const value = required(env, key);
  if (!/^postgres(ql)?:\/\//.test(value)) {
    throw new ConfigError(`${key} must be a postgres:// or postgresql:// URL`);
  }
  return value;
}

const TOKEN_PLACEHOLDER = "change-me-to-a-long-random-string";

/** Bearer token for the write API. The server co-signs submissions, so writes must be gated. */
export function readSubmitterApiToken(env: Env = process.env): string {
  const value = required(env, "SUBMITTER_API_TOKEN");
  if (value === TOKEN_PLACEHOLDER) {
    throw new ConfigError("SUBMITTER_API_TOKEN is still the .env.example placeholder");
  }
  if (value.length < 32)
    throw new ConfigError("SUBMITTER_API_TOKEN must be at least 32 characters");
  return value;
}
