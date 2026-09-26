import { describe, expect, it } from "vitest";
import { buildEventCanonical } from "@/lib/canonical/event";
import { buildParcelCanonical } from "@/lib/canonical/parcel";
import {
  REFERENCE_EVENT_SHA256,
  REFERENCE_PARCEL_SHA256,
  referenceEvent,
  referenceParcel,
} from "@/test/fixtures/records";
import { computeParcelHash } from "./parcel-hash";
import { computePayloadHash } from "./payload-hash";
import { isSha256Hex, parseTrackingId, sha256Hex } from "./sha256";

/** Collect every leaf path in a canonical JSON document, e.g. "carrier.name". */
function leafPaths(bytes: Uint8Array): string[] {
  const walk = (value: unknown, prefix: string): string[] =>
    typeof value === "object" && value !== null
      ? Object.entries(value).flatMap(([k, v]) => walk(v, prefix ? `${prefix}.${k}` : k))
      : [prefix];
  return walk(JSON.parse(new TextDecoder().decode(bytes)), "");
}

describe("sha256Hex", () => {
  it("matches a known SHA-256 vector", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("computePayloadHash", () => {
  it("hashes the reference event to the independently computed digest", async () => {
    expect(await computePayloadHash(referenceEvent)).toBe(REFERENCE_EVENT_SHA256);
  });

  it("is deterministic: same content → same bytes → same hash", async () => {
    const reordered = {
      timestamp: "2026-09-25T14:40:00+03:00",
      carrier: { scacCode: "MTNL", name: "MTN Logistics" },
      location: "Kampala Hub, Uganda",
      status: "In Transit",
    };
    const hashes = await Promise.all([
      computePayloadHash(referenceEvent),
      computePayloadHash(reordered),
      computePayloadHash(referenceEvent),
    ]);
    expect(new Set(hashes).size).toBe(1);
  });

  it("differs for every event (status change → different hash)", async () => {
    const next = await computePayloadHash({ ...referenceEvent, status: "Delivered" });
    expect(next).not.toBe(REFERENCE_EVENT_SHA256);
  });
});

describe("computeParcelHash", () => {
  it("hashes the reference parcel to the independently computed digest", async () => {
    expect(await computeParcelHash(referenceParcel)).toBe(REFERENCE_PARCEL_SHA256);
  });

  it("gives identical cargo with a different bookingRef a different tracking ID", async () => {
    const a = await computeParcelHash(referenceParcel);
    const b = await computeParcelHash({ ...referenceParcel, bookingRef: "BK-2026-000185" });
    expect(isSha256Hex(a)).toBe(true);
    expect(isSha256Hex(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("gives identical cargo created at a different time a different tracking ID", async () => {
    const b = await computeParcelHash({ ...referenceParcel, createdAt: "2026-09-20T08:15:01Z" });
    expect(b).not.toBe(REFERENCE_PARCEL_SHA256);
  });
});

describe("hash field sets", () => {
  it("are disjoint: no field is committed by both parcelHash and payloadHash", () => {
    const eventFields = leafPaths(buildEventCanonical(referenceEvent));
    const parcelFields = leafPaths(buildParcelCanonical(referenceParcel));
    expect(eventFields.sort()).toEqual([
      "carrier.name",
      "carrier.scacCode",
      "location",
      "status",
      "timestamp",
    ]);
    expect(parcelFields.sort()).toEqual([
      "bookingRef",
      "consignment.description",
      "consignment.grossMassKg",
      "consignment.packageCount",
      "consignment.packageType",
      "consignment.volumeCubicMeters",
      "createdAt",
      "parties.consignee",
      "parties.shipper",
    ]);
    expect(eventFields.filter((f) => parcelFields.includes(f))).toEqual([]);
  });
});

describe("parseTrackingId (exact match, no fuzzy normalization)", () => {
  it("accepts exactly 64 lower-case hex characters, trimming only surrounding whitespace", () => {
    expect(parseTrackingId(REFERENCE_PARCEL_SHA256)).toBe(REFERENCE_PARCEL_SHA256);
    expect(parseTrackingId(`  ${REFERENCE_PARCEL_SHA256}\n`)).toBe(REFERENCE_PARCEL_SHA256);
  });

  it.each([
    ["upper case", REFERENCE_PARCEL_SHA256.toUpperCase()],
    ["0x prefix", `0x${REFERENCE_PARCEL_SHA256}`],
    ["a prefix of the ID", REFERENCE_PARCEL_SHA256.slice(0, 63)],
    ["an extra character", `${REFERENCE_PARCEL_SHA256}0`],
    [
      "inner whitespace",
      `${REFERENCE_PARCEL_SHA256.slice(0, 32)} ${REFERENCE_PARCEL_SHA256.slice(32)}`,
    ],
    ["SQL wildcards", `${REFERENCE_PARCEL_SHA256.slice(0, 60)}%%%%`],
    ["empty", ""],
  ])("rejects %s instead of guessing what was meant", (_label, input) => {
    expect(parseTrackingId(input)).toBeNull();
  });
});
