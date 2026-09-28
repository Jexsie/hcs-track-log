import { describe, expect, it } from "vitest";
import { explorerRecordUrl, explorerTopicUrl } from "./explorer";

describe("HashScan links", () => {
  it("links a verified record to its transaction page by consensus timestamp", () => {
    expect(explorerRecordUrl("testnet", "1758800400.123456789")).toBe(
      "https://hashscan.io/testnet/transaction/1758800400.123456789",
    );
  });

  it("links the topic page", () => {
    expect(explorerTopicUrl("mainnet", "0.0.5005")).toBe(
      "https://hashscan.io/mainnet/topic/0.0.5005",
    );
  });

  it("refuses malformed identifiers instead of building odd URLs", () => {
    expect(explorerRecordUrl("testnet", "../x")).toBeNull();
    expect(explorerTopicUrl("testnet", "0.0.x")).toBeNull();
  });
});
