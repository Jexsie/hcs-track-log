import { describe, expect, it } from "vitest";
import { EXIT, verifyExitCode } from "./verify-topic";

const totals = (over: Partial<Record<"tampered" | "tamperedParcels" | "unavailable", number>>) => ({
  parcels: 1,
  verified: 1,
  tampered: 0,
  tamperedParcels: 0,
  unavailable: 0,
  ...over,
});

describe("verifyExitCode (npm run verify)", () => {
  it("passes only when everything verified and every ledger envelope is cached", () => {
    expect(verifyExitCode({ totals: totals({}), uncached: [] })).toBe(EXIT.verified);
  });

  it("fails when a ledger envelope has no cached row, e.g. an event deleted from Postgres", () => {
    expect(verifyExitCode({ totals: totals({}), uncached: [5n] })).toBe(EXIT.missingFromCache);
  });

  it("reports tampering ahead of missing rows, and missing rows ahead of an incomplete run", () => {
    expect(verifyExitCode({ totals: totals({ tampered: 1 }), uncached: [5n] })).toBe(EXIT.tampered);
    expect(verifyExitCode({ totals: totals({ tamperedParcels: 1 }), uncached: [] })).toBe(
      EXIT.tampered,
    );
    expect(verifyExitCode({ totals: totals({ unavailable: 1 }), uncached: [5n] })).toBe(
      EXIT.missingFromCache,
    );
    expect(verifyExitCode({ totals: totals({ unavailable: 1 }), uncached: [] })).toBe(
      EXIT.incomplete,
    );
  });
});
