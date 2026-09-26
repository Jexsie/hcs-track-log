import { canonicalize } from "./canonicalize";
import {
  normalizeDecimal,
  normalizePositiveInt,
  normalizeText,
  normalizeTimestamp,
} from "./normalize";
import { readField, readObject } from "./shape";

/** Immutable parcel properties committed by parcelHash (the public tracking ID). */
export type Parcel = {
  readonly consignment: {
    readonly description: string;
    readonly packageCount: number;
    readonly packageType: string;
    /** Fixed-scale, e.g. "142.50" */
    readonly grossMassKg: string;
    /** Fixed-scale, e.g. "0.85" */
    readonly volumeCubicMeters: string;
  };
  readonly parties: { readonly shipper: string; readonly consignee: string };
  readonly bookingRef: string;
  /** ISO-8601 UTC, whole seconds */
  readonly createdAt: string;
};

/** What callers pass in: form input at creation, or database columns at verify/search time. */
export interface ParcelInput {
  readonly consignment: {
    readonly description: string;
    readonly packageCount: number | string;
    readonly packageType: string;
    readonly grossMassKg: number | string;
    readonly volumeCubicMeters: number | string;
  };
  readonly parties: { readonly shipper: string; readonly consignee: string };
  readonly bookingRef: string;
  readonly createdAt: string | Date;
}

const PARCEL_KEYS = ["consignment", "parties", "bookingRef", "createdAt"] as const;
const CONSIGNMENT_KEYS = [
  "description",
  "packageCount",
  "packageType",
  "grossMassKg",
  "volumeCubicMeters",
] as const;
const PARTIES_KEYS = ["shipper", "consignee"] as const;

export function normalizeParcel(input: unknown): Parcel {
  const parcel = readObject(input, "", PARCEL_KEYS, "parcel");
  const consignment = readObject(parcel.consignment, "consignment", CONSIGNMENT_KEYS);
  const parties = readObject(parcel.parties, "parties", PARTIES_KEYS);
  const c = "consignment";
  return {
    consignment: {
      description: readField(consignment, c, "description", normalizeText),
      packageCount: readField(consignment, c, "packageCount", normalizePositiveInt),
      packageType: readField(consignment, c, "packageType", normalizeText),
      grossMassKg: readField(consignment, c, "grossMassKg", (v) => normalizeDecimal(v)),
      volumeCubicMeters: readField(consignment, c, "volumeCubicMeters", (v) => normalizeDecimal(v)),
    },
    parties: {
      shipper: readField(parties, "parties", "shipper", normalizeText),
      consignee: readField(parties, "parties", "consignee", normalizeText),
    },
    bookingRef: readField(parcel, "", "bookingRef", normalizeText),
    createdAt: readField(parcel, "", "createdAt", normalizeTimestamp),
  };
}

/**
 * THE canonical builder for parcels. Creation (form input) and search/verify (Postgres columns)
 * both call this; there is no other parcel serialization path.
 */
export function buildParcelCanonical(input: unknown): Uint8Array {
  return canonicalize(normalizeParcel(input));
}
