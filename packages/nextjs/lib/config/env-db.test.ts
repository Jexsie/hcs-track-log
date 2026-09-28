import { describe, expect, it } from "vitest";
import {
  readAdminSessionSecret,
  readApprovalWindowMs,
  readDatabaseUrl,
  readWalletConnectProjectId,
} from "./env";

describe("readDatabaseUrl", () => {
  it("accepts postgres URLs", () => {
    expect(readDatabaseUrl({ DATABASE_URL: "postgres://u:p@h:5432/db" })).toBe(
      "postgres://u:p@h:5432/db",
    );
    expect(readDatabaseUrl({ DATABASE_URL: "postgresql://h/db" })).toBe("postgresql://h/db");
  });

  it("rejects missing or non-postgres URLs", () => {
    expect(() => readDatabaseUrl({})).toThrow("DATABASE_URL");
    expect(() => readDatabaseUrl({ DATABASE_URL: "mysql://h/db" })).toThrow("DATABASE_URL");
  });
});

describe("readAdminSessionSecret", () => {
  it("requires at least 32 characters and rejects the placeholder", () => {
    expect(readAdminSessionSecret({ ADMIN_SESSION_SECRET: "x".repeat(32) })).toHaveLength(32);
    expect(() => readAdminSessionSecret({ ADMIN_SESSION_SECRET: "short" })).toThrow("32");
    expect(() =>
      readAdminSessionSecret({ ADMIN_SESSION_SECRET: "change-me-to-a-long-random-string" }),
    ).toThrow("placeholder");
    expect(() => readAdminSessionSecret({})).toThrow("ADMIN_SESSION_SECRET");
  });
});

describe("readApprovalWindowMs", () => {
  it("defaults to 24 hours and stays within Hedera's 62-day schedule limit", () => {
    expect(readApprovalWindowMs({})).toBe(24 * 3_600_000);
    expect(readApprovalWindowMs({ HCS_APPROVAL_WINDOW_HOURS: "72" })).toBe(72 * 3_600_000);
    expect(() => readApprovalWindowMs({ HCS_APPROVAL_WINDOW_HOURS: "0" })).toThrow();
    expect(() =>
      readApprovalWindowMs({ HCS_APPROVAL_WINDOW_HOURS: String(62 * 24 + 1) }),
    ).toThrow();
  });
});

describe("readWalletConnectProjectId", () => {
  it("returns a 32-hex project id or null", () => {
    expect(
      readWalletConnectProjectId({ NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "a".repeat(32) }),
    ).toBe("a".repeat(32));
    expect(readWalletConnectProjectId({ NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "nope" })).toBeNull();
    expect(readWalletConnectProjectId({})).toBeNull();
  });
});
