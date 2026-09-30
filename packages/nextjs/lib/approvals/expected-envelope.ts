import type { CargoEvent } from "@/lib/cargo/event";
import type { Parcel } from "@/lib/cargo/parcel";
import { buildEnvelope, serializeEnvelope } from "@/lib/notary/envelope";
import { computeParcelHash } from "@/lib/cargo/parcel";
import { computePayloadHash } from "@/lib/cargo/event";
import type { SubmissionKind } from "./ports";

export interface SubmissionContent {
  kind: SubmissionKind;
  parcelHash: string;
  parcel: Parcel | null;
  event: CargoEvent;
}

/**
 * The envelope this content MUST produce, recomputed from the content itself. Used by approvers'
 * browsers before signing and by the server before caching. Null if a registration's parcel does
 * not hash to its tracking ID, or the content no longer normalizes.
 */
export async function expectedEnvelope(s: SubmissionContent): Promise<Uint8Array | null> {
  try {
    if (
      s.kind === "register-parcel" &&
      (!s.parcel || (await computeParcelHash(s.parcel)) !== s.parcelHash)
    ) {
      return null;
    }

    return serializeEnvelope(
      buildEnvelope({ parcelHash: s.parcelHash, payloadHash: await computePayloadHash(s.event) }),
    );
  } catch {
    return null;
  }
}
