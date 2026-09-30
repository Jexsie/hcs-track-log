import { describe, expect, it } from "vitest";
import { newestFirst } from "./order";

const ev = (seq: string) => ({ id: `e${seq}`, hcsSequenceNumber: seq });

describe("newestFirst", () => {
  it("orders by HCS sequence number, latest first, keeping each verdict with its own event", () => {
    const events = [ev("2"), ev("10"), ev("9007199254740993")];
    const verdicts = ["verdict-2", "verdict-10", undefined];

    expect(newestFirst(events, verdicts)).toEqual([
      { event: ev("9007199254740993"), verdict: undefined },
      { event: ev("10"), verdict: "verdict-10" },
      { event: ev("2"), verdict: "verdict-2" },
    ]);
  });

  it("does not mutate its inputs", () => {
    const events = [ev("1"), ev("2")];

    newestFirst(events, []);
    expect(events.map((e) => e.hcsSequenceNumber)).toEqual(["1", "2"]);
  });
});
