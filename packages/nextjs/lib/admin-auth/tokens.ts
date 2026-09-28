import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type AuthErrorCode =
  "BAD_CHALLENGE" | "UNKNOWN_ACCOUNT" | "BAD_SIGNATURE" | "NOT_A_SUBMITTER" | "UNAUTHENTICATED";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 8 * 3_600_000;

type Purpose = "challenge" | "session";

function mac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** `<base64url(json)>.<hmac>`; the purpose is inside the MAC so tokens can't be swapped. */
function sign(
  purpose: Purpose,
  claims: Record<string, unknown>,
  secret: string,
  expiresAt: number,
): string {
  const payload = Buffer.from(JSON.stringify({ typ: purpose, exp: expiresAt, ...claims })).toString(
    "base64url",
  );
  return `${payload}.${mac(payload, secret)}`;
}

function open(
  purpose: Purpose,
  token: string | undefined,
  secret: string,
  now: Date,
): Record<string, unknown> | null {
  const [payload, signature, extra] = (token ?? "").split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(mac(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims !== "object" || claims === null) return null;
  const c = claims as Record<string, unknown>;
  if (c.typ !== purpose || typeof c.exp !== "number" || c.exp <= now.getTime()) return null;
  return c;
}

export interface Challenge {
  /** The exact text the wallet is asked to sign. */
  message: string;
  /** Stateless proof that this server issued `message`, valid for five minutes. */
  token: string;
}

export function issueChallenge({
  accountId,
  domain,
  secret,
  now,
}: {
  accountId: string;
  domain: string;
  secret: string;
  now: Date;
}): Challenge {
  const expires = new Date(now.getTime() + CHALLENGE_TTL_MS);
  const message = [
    "hcs-track-log administrator sign-in",
    `Domain: ${domain}`,
    `Account: ${accountId}`,
    `Nonce: ${randomBytes(16).toString("hex")}`,
    `Issued: ${now.toISOString()}`,
    `Expires: ${expires.toISOString()}`,
  ].join("\n");
  return { message, token: sign("challenge", { accountId, message }, secret, expires.getTime()) };
}

export function verifyChallenge(
  token: string,
  secret: string,
  now: Date,
): { accountId: string; message: string } {
  const claims = open("challenge", token, secret, now);
  if (!claims || typeof claims.accountId !== "string" || typeof claims.message !== "string") {
    throw new AuthError(
      "BAD_CHALLENGE",
      "sign-in challenge is invalid or expired; request a new one",
    );
  }
  return { accountId: claims.accountId, message: claims.message };
}

export interface AdminIdentity {
  accountId: string;
  /** DER-encoded public key that signed in (one of the topic's submit keys). */
  publicKey: string;
}

export function issueSessionToken(identity: AdminIdentity, secret: string, now: Date): string {
  return sign("session", { ...identity }, secret, now.getTime() + SESSION_TTL_MS);
}

export function readSessionToken(
  token: string | undefined,
  secret: string,
  now: Date,
): AdminIdentity | null {
  const claims = open("session", token, secret, now);
  if (!claims || typeof claims.accountId !== "string" || typeof claims.publicKey !== "string")
    return null;
  return { accountId: claims.accountId, publicKey: claims.publicKey };
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
