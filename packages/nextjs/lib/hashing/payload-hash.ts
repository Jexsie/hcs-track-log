import { buildEventCanonical } from "@/lib/canonical/event";
import { sha256Hex } from "./sha256";

/** payloadHash: SHA-256 of one event's canonical content. Computed fresh; never read from storage. */
export function computePayloadHash(event: unknown): Promise<string> {
  return sha256Hex(buildEventCanonical(event));
}
