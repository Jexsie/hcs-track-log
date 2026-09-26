import type { CargoEventInput } from "@/lib/canonical/event";
import type { ParcelInput } from "@/lib/canonical/parcel";

/** The brief's reference event. Its canonical form is fixed by the spec. */
export const referenceEvent: CargoEventInput = {
  status: "In Transit",
  location: "Kampala Hub, Uganda",
  carrier: { name: "MTN Logistics", scacCode: "MTNL" },
  timestamp: "2026-09-25T11:40:00Z",
};

export const REFERENCE_EVENT_CANONICAL =
  '{"carrier":{"name":"MTN Logistics","scacCode":"MTNL"},"location":"Kampala Hub, Uganda","status":"In Transit","timestamp":"2026-09-25T11:40:00Z"}';

/** `printf '%s' "$REFERENCE_EVENT_CANONICAL" | shasum -a 256` */
export const REFERENCE_EVENT_SHA256 =
  "e41ee962da7b0132b53bbedf48f968e9f5bbc3a03bd7f5d689138487cf7b6a45";

export const referenceParcel: ParcelInput = {
  consignment: {
    description: "Coffee beans, green, bagged",
    packageCount: 12,
    packageType: "Bag",
    grossMassKg: "142.5",
    volumeCubicMeters: 0.85,
  },
  parties: {
    shipper: "Bugisu Coffee Co-op, Mbale",
    consignee: "Hamburg Roasters GmbH",
  },
  bookingRef: "BK-2026-000184",
  createdAt: "2026-09-20T08:15:00Z",
};

export const REFERENCE_PARCEL_CANONICAL =
  '{"bookingRef":"BK-2026-000184","consignment":{"description":"Coffee beans, green, bagged","grossMassKg":"142.50","packageCount":12,"packageType":"Bag","volumeCubicMeters":"0.85"},"createdAt":"2026-09-20T08:15:00Z","parties":{"consignee":"Hamburg Roasters GmbH","shipper":"Bugisu Coffee Co-op, Mbale"}}';

/** `printf '%s' "$REFERENCE_PARCEL_CANONICAL" | shasum -a 256` */
export const REFERENCE_PARCEL_SHA256 =
  "5010a5b2d3491a4f27a7495aced3c200d9ca587435a70a5e6001b28c66039b60";
