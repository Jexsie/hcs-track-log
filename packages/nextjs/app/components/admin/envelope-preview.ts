import { buildEnvelope, serializeEnvelope } from "@/lib/envelope/envelope";
import { computePayloadHash } from "@/lib/hashing/payload-hash";

/** Recompute, in the browser, the exact envelope that was submitted for `event`. */
export async function envelopeFor(parcelHash: string, event: unknown): Promise<string | null> {
  try {
    const payloadHash = await computePayloadHash(event);
    return new TextDecoder().decode(serializeEnvelope(buildEnvelope({ parcelHash, payloadHash })));
  } catch {
    return null;
  }
}
