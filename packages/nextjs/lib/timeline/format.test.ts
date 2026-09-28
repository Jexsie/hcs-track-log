import { describe, expect, it } from "vitest";
import { formatUtc } from "./format";

describe("display formatting", () => {
  it("formats ISO instants as readable UTC and passes unparseable values through", () => {
    expect(formatUtc("2026-09-25T11:40:00.000Z")).toBe("25 Sep 2026, 11:40:00 UTC");
    expect(formatUtc("garbage")).toBe("garbage");
  });
});
