import { describe, expect, it } from "vitest";
import { formatConsensusTimestamp, formatUtc, shortHash } from "./format";

describe("display formatting", () => {
  it("formats ISO instants as readable UTC and passes unparseable values through", () => {
    expect(formatUtc("2026-09-25T11:40:00.000Z")).toBe("25 Sep 2026, 11:40:00 UTC");
    expect(formatUtc("garbage")).toBe("garbage");
  });

  it("formats mirror consensus timestamps (seconds.nanos)", () => {
    expect(formatConsensusTimestamp("1758800400.123456789")).toBe("25 Sep 2025, 11:40:00 UTC");
    expect(formatConsensusTimestamp("x")).toBe("x");
  });

  it("shortens hashes for display", () => {
    expect(shortHash("e41ee962da7b0132b53bbedf48f968e9f5bbc3a03bd7f5d689138487cf7b6a45")).toBe(
      "e41ee962…cf7b6a45",
    );
  });
});
