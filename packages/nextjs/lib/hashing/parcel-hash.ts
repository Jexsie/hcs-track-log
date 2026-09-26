import { buildParcelCanonical } from "@/lib/canonical/parcel";
import { sha256Hex } from "./sha256";

/** parcelHash: the public tracking ID, SHA-256 of the parcel's immutable canonical content. */
export function computeParcelHash(parcel: unknown): Promise<string> {
  return sha256Hex(buildParcelCanonical(parcel));
}
