import { describe, expect, it } from "vitest";
import { readDatabaseUrl, readSubmitterApiToken } from "./env";

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

describe("readSubmitterApiToken", () => {
  it("requires at least 32 characters and rejects the placeholder", () => {
    expect(readSubmitterApiToken({ SUBMITTER_API_TOKEN: "x".repeat(32) })).toHaveLength(32);
    expect(() => readSubmitterApiToken({ SUBMITTER_API_TOKEN: "short" })).toThrow("32");
    expect(() =>
      readSubmitterApiToken({ SUBMITTER_API_TOKEN: "change-me-to-a-long-random-string" }),
    ).toThrow("placeholder");
    expect(() => readSubmitterApiToken({})).toThrow("SUBMITTER_API_TOKEN");
  });
});
