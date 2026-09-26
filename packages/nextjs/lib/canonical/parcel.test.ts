import { describe, expect, it } from "vitest";
import { REFERENCE_PARCEL_CANONICAL, referenceParcel } from "@/test/fixtures/records";
import { ValidationError } from "./errors";
import { buildParcelCanonical, normalizeParcel } from "./parcel";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("buildParcelCanonical", () => {
  it("serializes with sorted keys, fixed-scale decimals and ISO Z timestamp", () => {
    expect(text(buildParcelCanonical(referenceParcel))).toBe(REFERENCE_PARCEL_CANONICAL);
  });

  it("produces identical bytes from form-style and database-style inputs", () => {
    // Form: numbers/strings as typed. Database: NUMERIC as strings, INT as number, timestamptz as Date.
    const fromDatabase = {
      consignment: {
        description: "Coffee beans, green, bagged",
        packageCount: 12,
        packageType: "Bag",
        grossMassKg: "142.50",
        volumeCubicMeters: "0.85",
      },
      parties: { shipper: "Bugisu Coffee Co-op, Mbale", consignee: "Hamburg Roasters GmbH" },
      bookingRef: "BK-2026-000184",
      createdAt: new Date("2026-09-20T08:15:00.000Z"),
    };
    expect(buildParcelCanonical(fromDatabase)).toEqual(buildParcelCanonical(referenceParcel));
  });
});

describe("normalizeParcel", () => {
  it.each([
    [
      "consignment.packageCount",
      { ...referenceParcel, consignment: { ...referenceParcel.consignment, packageCount: 0 } },
    ],
    [
      "consignment.grossMassKg",
      { ...referenceParcel, consignment: { ...referenceParcel.consignment, grossMassKg: "1.234" } },
    ],
    ["parties.consignee", { ...referenceParcel, parties: { shipper: "A" } }],
    ["bookingRef", { ...referenceParcel, bookingRef: "" }],
    ["createdAt", { ...referenceParcel, createdAt: "2026-09-20" }],
  ])("rejects invalid %s", (path, input) => {
    try {
      normalizeParcel(input);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).path).toBe(path);
    }
  });

  it("rejects event fields and unknown fields", () => {
    expect(() => normalizeParcel({ ...referenceParcel, status: "In Transit" })).toThrow("status");
    expect(() =>
      normalizeParcel({ ...referenceParcel, parties: { ...referenceParcel.parties, notify: "X" } }),
    ).toThrow("parties.notify");
  });
});
