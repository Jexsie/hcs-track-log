/** Typed, validated readers for server-side configuration. Each reader requires only what it needs. */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

const HEDERA_NETWORKS = ["testnet", "previewnet", "mainnet"] as const;
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

  if (!ENTITY_ID.test(value)) {
    throw new ConfigError(`${key} must look like 0.0.12345, got "${value}"`);
  }

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

/** HCS_{ROLE}_SIGNER_KEYS: private keys this process signs with (only topic:create, for admin). */
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

const MAX_APPROVAL_WINDOW_HOURS = 62 * 24; // Hedera's long-term schedule limit

/** HCS_APPROVAL_WINDOW_HOURS: how long a proposal waits for wallet approvals (default 24h). */
export function readApprovalWindowMs(env: Env = process.env): number {
  const raw = env.HCS_APPROVAL_WINDOW_HOURS?.trim() || "24";
  const hours = Number(raw);

  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_APPROVAL_WINDOW_HOURS) {
    throw new ConfigError(
      `HCS_APPROVAL_WINDOW_HOURS must be an integer from 1 to ${MAX_APPROVAL_WINDOW_HOURS}, got "${raw}"`,
    );
  }

  return hours * 3_600_000;
}

/** ADMIN_SESSION_SECRET: HMAC key for sign-in challenges and admin session cookies. */
export function readAdminSessionSecret(env: Env = process.env): string {
  const value = required(env, "ADMIN_SESSION_SECRET");

  if (value === "change-me-to-a-long-random-string") {
    throw new ConfigError("ADMIN_SESSION_SECRET is still the .env.example placeholder");
  }

  if (value.length < 32) {
    throw new ConfigError("ADMIN_SESSION_SECRET must be at least 32 characters");
  }

  return value;
}

/** NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID from dashboard.reown.com; null when not configured. */
export function readWalletConnectProjectId(env: Env = process.env): string | null {
  const value = env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

  return value && /^[0-9a-f]{32}$/i.test(value) ? value : null;
}
