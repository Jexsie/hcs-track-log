import {
  ConfigError,
  type HederaNetwork,
  readMirrorNodeUrl,
  readNetwork,
  readTopicId,
} from "@/lib/config/env";

export interface LedgerLinks {
  network: HederaNetwork;
  topicId: string;
  mirrorBaseUrl: string;
}

/** Topic + mirror node for building public links; null when the server is not configured. */
export function readLedgerLinks(): LedgerLinks | null {
  try {
    return { network: readNetwork(), topicId: readTopicId(), mirrorBaseUrl: readMirrorNodeUrl() };
  } catch (error) {
    if (error instanceof ConfigError) return null;
    throw error;
  }
}
