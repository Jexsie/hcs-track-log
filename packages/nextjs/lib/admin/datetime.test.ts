import { describe, expect, it } from "vitest";
import { normalizeTimestamp } from "@/lib/canonical/normalize";
import { localInputToUtc, toLocalInputValue } from "./datetime";

describe("datetime-local ⇄ canonical UTC", () => {
  it("interprets the input in the browser's time zone and returns canonical UTC", () => {
    const local = new Date(2026, 8, 25, 14, 40, 5); // what the admin sees on their clock
    const utc = localInputToUtc("2026-09-25T14:40:05");

    expect(utc).toBe(`${local.toISOString().slice(0, 19)}Z`);
    expect(normalizeTimestamp(utc)).toBe(utc); // already canonical
  });

  it("accepts minute precision (seconds default to :00)", () => {
    expect(localInputToUtc("2026-09-25T14:40")).toBe(
      `${new Date(2026, 8, 25, 14, 40, 0).toISOString().slice(0, 19)}Z`,
    );
  });

  it("returns null for empty or unparseable input", () => {
    expect(localInputToUtc("")).toBeNull();
    expect(localInputToUtc("yesterday")).toBeNull();
  });

  it("formats a Date for a datetime-local input, dropping milliseconds", () => {
    const d = new Date(2026, 0, 2, 3, 4, 5, 678);

    expect(toLocalInputValue(d)).toBe("2026-01-02T03:04:05");
    expect(localInputToUtc(toLocalInputValue(d))).toBe(
      `${new Date(2026, 0, 2, 3, 4, 5).toISOString().slice(0, 19)}Z`,
    );
  });
});
