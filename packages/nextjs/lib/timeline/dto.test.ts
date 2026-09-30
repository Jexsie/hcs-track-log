import { describe, expect, it } from "vitest";
import { buildEventCanonical } from "@/lib/canonical/event";
import { buildParcelCanonical } from "@/lib/canonical/parcel";
import type { StoredEvent, StoredParcel } from "@/lib/db/rows";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { eventsToVerify, toTimelineDto } from "./dto";

const parcel: StoredParcel = {
  parcelHash: "a".repeat(64),
  content: {
    ...referenceParcel,
    consignment: {
      ...referenceParcel.consignment,
      grossMassKg: "142.50",
      volumeCubicMeters: "0.85",
    },
    createdAt: new Date("2026-09-20T08:15:00Z"),
  },
};
const event: StoredEvent = {
  id: "00000000-0000-0000-0000-000000000001",
  parcelHash: parcel.parcelHash,
  hcsSequenceNumber: 9007199254740993n,
  payerAccountId: "0.0.1001",
  recordedAt: new Date("2026-09-25T11:40:03.123Z"),
  content: { ...referenceEvent, timestamp: new Date("2026-09-25T11:40:00Z") },
};

describe("timeline DTO", () => {
  it("survives JSON transport without changing the canonical bytes", () => {
    const dto = JSON.parse(JSON.stringify(toTimelineDto(parcel, [event]))) as ReturnType<
      typeof toTimelineDto
    >;

    expect(buildParcelCanonical(dto.parcel)).toEqual(buildParcelCanonical(parcel.content));
    const [first] = dto.events;

    expect(first && buildEventCanonical(first.content)).toEqual(buildEventCanonical(event.content));
    expect(first?.hcsSequenceNumber).toBe("9007199254740993");
    expect(eventsToVerify(dto)[0]?.hcsSequenceNumber).toBe(9007199254740993n);
  });

  it("carries content only: no hash other than the searched tracking ID", () => {
    const json = JSON.stringify(toTimelineDto(parcel, [event]));

    expect(json.match(/[0-9a-f]{64}/g)).toEqual([parcel.parcelHash]);
    expect(json).not.toMatch(/payloadHash/i);
  });
});
