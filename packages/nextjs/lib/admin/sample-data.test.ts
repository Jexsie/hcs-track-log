import { describe, expect, it } from "vitest";
import { normalizeCargoEvent } from "@/lib/canonical/event";
import { normalizeParcel } from "@/lib/canonical/parcel";
import { sampleDataAllowed, sampleEventForm, sampleParcelForm } from "./sample-data";
import {
  toEventPayload,
  toParcelPayload,
  validateEventForm,
  validateParcelForm,
} from "./validation";

describe("sample data", () => {
  it("always produces forms that pass the server's own validation", () => {
    for (let i = 0; i < 300; i++) {
      const parcel = sampleParcelForm();
      const event = sampleEventForm();
      expect(validateParcelForm(parcel)).toEqual({});
      expect(validateEventForm(event)).toEqual({});
      expect(() =>
        normalizeParcel({ ...toParcelPayload(parcel), createdAt: "2026-09-28T10:00:00Z" }),
      ).not.toThrow();
      expect(() => normalizeCargoEvent(toEventPayload(event))).not.toThrow();
    }
  });

  it("gives every sample parcel a different booking reference (so tracking IDs differ)", () => {
    const refs = new Set(Array.from({ length: 200 }, () => sampleParcelForm().bookingRef));
    expect(refs.size).toBe(200);
  });

  it("dates events in the recent past, never the future", () => {
    const now = new Date(2026, 8, 28, 12, 0, 0);
    for (let i = 0; i < 100; i++) {
      const utc = toEventPayload(sampleEventForm(now)).timestamp;
      const t = Date.parse(utc);
      expect(t).toBeLessThanOrEqual(now.getTime());
      expect(t).toBeGreaterThan(now.getTime() - 8 * 86_400_000);
    }
  });

  it("is offered on test networks only, never mainnet", () => {
    expect(sampleDataAllowed("testnet")).toBe(true);
    expect(sampleDataAllowed("previewnet")).toBe(true);
    expect(sampleDataAllowed("mainnet")).toBe(false);
  });
});
