import { describe, expect, it } from "vitest";
import { REFERENCE_EVENT_CANONICAL, referenceEvent } from "@/test/fixtures/records";
import { ValidationError } from "./errors";
import { buildEventCanonical, normalizeCargoEvent } from "./event";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("buildEventCanonical", () => {
  it("matches the reference canonical output exactly", () => {
    expect(text(buildEventCanonical(referenceEvent))).toBe(REFERENCE_EVENT_CANONICAL);
  });

  it("is deterministic: equivalent inputs produce identical bytes", () => {
    const messy = {
      timestamp: "2026-09-25T14:40:00+03:00",
      carrier: { scacCode: " mtnl ", name: "  MTN Logistics" },
      location: "Kampala Hub, Uganda  ",
      status: "\tIn Transit",
    };
    const fromDate = { ...referenceEvent, timestamp: new Date("2026-09-25T11:40:00Z") };

    const expected = buildEventCanonical(referenceEvent);

    expect(buildEventCanonical(messy)).toEqual(expected);
    expect(buildEventCanonical(fromDate)).toEqual(expected);
    expect(buildEventCanonical(referenceEvent)).toEqual(expected);
  });

  it("changes when any committed field changes", () => {
    const base = text(buildEventCanonical(referenceEvent));
    const variants = [
      { ...referenceEvent, status: "Delivered" },
      { ...referenceEvent, location: "Mombasa Port, Kenya" },
      { ...referenceEvent, carrier: { ...referenceEvent.carrier, name: "Other" } },
      { ...referenceEvent, carrier: { ...referenceEvent.carrier, scacCode: "OTHR" } },
      { ...referenceEvent, timestamp: "2026-09-25T11:40:01Z" },
    ];

    for (const v of variants) expect(text(buildEventCanonical(v))).not.toBe(base);
  });
});

describe("normalizeCargoEvent", () => {
  it("returns the normalized record", () => {
    expect(
      normalizeCargoEvent({
        ...referenceEvent,
        carrier: { name: "MTN Logistics", scacCode: "mtnl" },
      }),
    ).toEqual({
      status: "In Transit",
      location: "Kampala Hub, Uganda",
      carrier: { name: "MTN Logistics", scacCode: "MTNL" },
      timestamp: "2026-09-25T11:40:00Z",
    });
  });

  it.each([
    ["status", { ...referenceEvent, status: undefined }],
    ["location", { ...referenceEvent, location: "  " }],
    ["carrier", { ...referenceEvent, carrier: undefined }],
    ["carrier.name", { ...referenceEvent, carrier: { scacCode: "MTNL" } }],
    ["carrier.scacCode", { ...referenceEvent, carrier: { name: "X", scacCode: "M1" } }],
    ["timestamp", { ...referenceEvent, timestamp: "yesterday" }],
  ])("rejects invalid %s with the field path", (path, input) => {
    try {
      normalizeCargoEvent(input);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).path).toBe(path);
    }
  });

  it("rejects fields that are not committed by payloadHash", () => {
    expect(() => normalizeCargoEvent({ ...referenceEvent, payerAccountId: "0.0.1" })).toThrow(
      "payerAccountId",
    );
    expect(() =>
      normalizeCargoEvent({
        ...referenceEvent,
        carrier: { ...referenceEvent.carrier, phone: "1" },
      }),
    ).toThrow("carrier.phone");
  });

  it("rejects parcel fields: the two hashes cover disjoint field sets", () => {
    expect(() => normalizeCargoEvent({ ...referenceEvent, bookingRef: "BK-1" })).toThrow(
      ValidationError,
    );
  });

  it("rejects non-object input", () => {
    expect(() => normalizeCargoEvent(null)).toThrow("event is required");
    expect(() => normalizeCargoEvent("In Transit")).toThrow("event must be an object");
    expect(() => normalizeCargoEvent([])).toThrow("event must be an object");
  });
});
