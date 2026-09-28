import { describe, expect, it } from "vitest";
import { normalizeCargoEvent } from "@/lib/canonical/event";
import { normalizeParcel } from "@/lib/canonical/parcel";
import {
  EMPTY_EVENT_FORM,
  EMPTY_PARCEL_FORM,
  type EventForm,
  type ParcelForm,
  fieldForPath,
  friendlyMessage,
  toEventPayload,
  toParcelPayload,
  validateEventForm,
  validateParcelForm,
} from "./validation";

const parcel: ParcelForm = {
  description: " Coffee beans, green, bagged ",
  packageCount: "12",
  packageType: "Bag",
  grossMassKg: "142.5",
  volumeCubicMeters: "0.85",
  shipper: "Bugisu Coffee Co-op, Mbale",
  consignee: "Hamburg Roasters GmbH",
  bookingRef: "BK-2026-000184",
};
const event: EventForm = {
  status: "Booked",
  location: "Mbale, Uganda",
  carrierName: "MTN Logistics",
  scacCode: "mtnl",
  timestamp: "2026-09-25T14:40",
};

describe("validateParcelForm / validateEventForm", () => {
  it("accepts valid forms", () => {
    expect(validateParcelForm(parcel)).toEqual({});
    expect(validateEventForm(event)).toEqual({});
  });

  it("reports every invalid field at once, not just the first", () => {
    expect(Object.keys(validateParcelForm(EMPTY_PARCEL_FORM)).sort()).toEqual(
      Object.keys(EMPTY_PARCEL_FORM).sort(),
    );
    expect(Object.keys(validateEventForm(EMPTY_EVENT_FORM)).sort()).toEqual(
      Object.keys(EMPTY_EVENT_FORM).sort(),
    );
  });

  it.each([
    ["grossMassKg", { grossMassKg: "1.005" }, "up to 2 decimals"],
    ["volumeCubicMeters", { volumeCubicMeters: "-1" }, "up to 2 decimals"],
    ["packageCount", { packageCount: "2.5" }, "whole number"],
  ] as const)(
    "flags %s with a plain-language message (server rules underneath)",
    (field, change, message) => {
      expect(validateParcelForm({ ...parcel, ...change })[field]).toContain(message);
    },
  );

  it("flags an invalid SCAC code and a missing timestamp", () => {
    const errors = validateEventForm({ ...event, scacCode: "M1", timestamp: "" });
    expect(errors.scacCode).toBe("Use 2–4 letters, e.g. MAEU");
    expect(errors.timestamp).toBe("Pick a date and time");
    expect(errors.timestamp).toBeDefined();
  });
});

describe("payload builders", () => {
  it("build payloads the shared normalizers accept (decimals stay strings, time becomes canonical UTC)", () => {
    const p = toParcelPayload(parcel);
    expect(p.consignment.grossMassKg).toBe("142.5");
    expect(() => normalizeParcel({ ...p, createdAt: "2026-09-25T00:00:00Z" })).not.toThrow();

    const e = toEventPayload(event);
    expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(normalizeCargoEvent(e).carrier.scacCode).toBe("MTNL");
  });
});

describe("friendly messages", () => {
  it("says Required for empty fields and never shows internal wording", () => {
    const errors = validateParcelForm(EMPTY_PARCEL_FORM);
    expect(errors.description).toBe("Required");
    for (const message of Object.values({ ...errors, ...validateEventForm(EMPTY_EVENT_FORM) })) {
      expect(message).not.toMatch(/must|decimal number|integer|hash|scac/i);
    }
  });

  it("gives a field's plain message for a server-side validation error", () => {
    expect(friendlyMessage("grossMassKg")).toBe(
      "Enter a number with up to 2 decimals, e.g. 142.50",
    );
  });
});

describe("fieldForPath", () => {
  it("maps server validation paths to form fields", () => {
    expect(fieldForPath("consignment.grossMassKg")).toBe("grossMassKg");
    expect(fieldForPath("parties.consignee")).toBe("consignee");
    expect(fieldForPath("bookingRef")).toBe("bookingRef");
    expect(fieldForPath("carrier.scacCode")).toBe("scacCode");
    expect(fieldForPath("carrier.name")).toBe("carrierName");
    expect(fieldForPath("timestamp")).toBe("timestamp");
    expect(fieldForPath("body")).toBeNull();
  });
});
