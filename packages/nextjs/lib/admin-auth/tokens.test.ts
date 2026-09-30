import { describe, expect, it } from "vitest";
import {
  AuthError,
  issueChallenge,
  issueSessionToken,
  readSessionToken,
  verifyChallenge,
} from "./tokens";

const SECRET = "s".repeat(40);
const T0 = new Date("2026-09-28T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

describe("sign-in challenge", () => {
  it("binds account, domain and a nonce, and verifies within five minutes", () => {
    const a = issueChallenge({
      accountId: "0.0.1234",
      domain: "localhost:3000",
      secret: SECRET,
      now: T0,
    });
    const b = issueChallenge({
      accountId: "0.0.1234",
      domain: "localhost:3000",
      secret: SECRET,
      now: T0,
    });

    expect(a.message).toContain("Account: 0.0.1234");
    expect(a.message).toContain("Domain: localhost:3000");
    expect(a.message).not.toBe(b.message); // fresh nonce each time
    expect(verifyChallenge(a.token, SECRET, later(4 * 60_000))).toEqual({
      accountId: "0.0.1234",
      message: a.message,
    });
  });

  it("rejects expired, tampered, foreign-secret and session tokens", () => {
    const { token } = issueChallenge({
      accountId: "0.0.1234",
      domain: "d",
      secret: SECRET,
      now: T0,
    });

    expect(() => verifyChallenge(token, SECRET, later(6 * 60_000))).toThrow(AuthError);
    expect(() => verifyChallenge(`${token.slice(0, -2)}xx`, SECRET, T0)).toThrow(AuthError);
    expect(() => verifyChallenge(token, "t".repeat(40), T0)).toThrow(AuthError);
    const session = issueSessionToken({ accountId: "0.0.1234", publicKey: "abcd" }, SECRET, T0);

    expect(() => verifyChallenge(session, SECRET, T0)).toThrow(AuthError);
  });
});

describe("session token", () => {
  it("round-trips the identity until it expires after 8 hours", () => {
    const token = issueSessionToken({ accountId: "0.0.1234", publicKey: "abcd" }, SECRET, T0);

    expect(readSessionToken(token, SECRET, later(7 * 3_600_000))).toEqual({
      accountId: "0.0.1234",
      publicKey: "abcd",
    });
    expect(readSessionToken(token, SECRET, later(9 * 3_600_000))).toBeNull();
  });

  it("returns null for garbage, tampering, or a challenge token", () => {
    const { token } = issueChallenge({ accountId: "0.0.1", domain: "d", secret: SECRET, now: T0 });

    expect(readSessionToken(token, SECRET, T0)).toBeNull();
    expect(readSessionToken("garbage", SECRET, T0)).toBeNull();
    expect(readSessionToken(undefined, SECRET, T0)).toBeNull();
    const session = issueSessionToken({ accountId: "0.0.1", publicKey: "ab" }, SECRET, T0);
    const [payload, mac] = session.split(".");
    const forged = `${Buffer.from(JSON.stringify({ typ: "session", accountId: "0.0.666", publicKey: "ab", exp: 9e15 })).toString("base64url")}.${mac}`;

    expect(payload).toBeDefined();
    expect(readSessionToken(forged, SECRET, T0)).toBeNull();
  });
});
