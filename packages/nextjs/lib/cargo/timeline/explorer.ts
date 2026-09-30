import type { HederaNetwork } from "@/lib/hedera/wallet/hip820";

/** Human-readable pages on HashScan, the public Hedera explorer. */
const BASE = "https://hashscan.io";

/** The record's transaction page; HashScan resolves a consensus timestamp directly. */
export function explorerRecordUrl(
  network: HederaNetwork,
  consensusTimestamp: string,
): string | null {
  return /^\d+\.\d{1,9}$/.test(consensusTimestamp)
    ? `${BASE}/${network}/transaction/${consensusTimestamp}`
    : null;
}

export function explorerTopicUrl(network: HederaNetwork, topicId: string): string | null {
  return /^\d+\.\d+\.\d+$/.test(topicId) ? `${BASE}/${network}/topic/${topicId}` : null;
}
