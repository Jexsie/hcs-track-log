import { describe, expect, it } from "vitest";
import { REFERENCE_EVENT_SHA256, REFERENCE_PARCEL_SHA256 } from "@/test/fixtures/records";
import {
  ENVELOPE_VERSION,
  EnvelopeError,
  buildEnvelope,
  parseEnvelope,
  serializeEnvelope,
} from "./envelope";

const envelope = { v: 1, parcelHash: REFERENCE_PARCEL_SHA256, payloadHash: REFERENCE_EVENT_SHA256 };
const json = (value: unknown) => JSON.stringify(value);

describe("buildEnvelope / serializeEnvelope", () => {
  it("carries only the blind notary fields, canonically serialized", () => {
    const built = buildEnvelope({
      parcelHash: REFERENCE_PARCEL_SHA256,
      payloadHash: REFERENCE_EVENT_SHA256,
    });
    expect(built).toEqual(envelope);
    expect(ENVELOPE_VERSION).toBe(1);
    expect(new TextDecoder().decode(serializeEnvelope(built))).toBe(
      `{"parcelHash":"${REFERENCE_PARCEL_SHA256}","payloadHash":"${REFERENCE_EVENT_SHA256}","v":1}`,
    );
  });

  it("refuses to build with malformed hashes", () => {
    expect(() => buildEnvelope({ parcelHash: "abc", payloadHash: REFERENCE_EVENT_SHA256 })).toThrow(
      EnvelopeError,
    );
  });
});

describe("parseEnvelope", () => {
  it("round-trips serialized bytes and accepts strings", () => {
    expect(parseEnvelope(serializeEnvelope(envelope))).toEqual(envelope);
    expect(parseEnvelope(json(envelope))).toEqual(envelope);
  });

  it.each([
    ["not JSON", "{oops", "not valid JSON"],
    ["an array", "[]", "must be a JSON object"],
    ["null", "null", "must be a JSON object"],
    ["business metadata", json({ ...envelope, status: "In Transit" }), 'unexpected field "status"'],
    ["a missing payloadHash", json({ v: 1, parcelHash: REFERENCE_PARCEL_SHA256 }), "payloadHash"],
    ["an unsupported version", json({ ...envelope, v: 2 }), "unsupported envelope version"],
    ["a string version", json({ ...envelope, v: "1" }), "unsupported envelope version"],
    [
      "an upper-case hash",
      json({ ...envelope, parcelHash: REFERENCE_PARCEL_SHA256.toUpperCase() }),
      "parcelHash",
    ],
    ["a short hash", json({ ...envelope, payloadHash: "ab" }), "payloadHash"],
  ])("rejects %s", (_label, raw, message) => {
    expect(() => parseEnvelope(raw)).toThrow(EnvelopeError);
    expect(() => parseEnvelope(raw)).toThrow(message);
  });

  it("rejects bytes that are not valid UTF-8", () => {
    expect(() => parseEnvelope(new Uint8Array([0xff, 0xfe]))).toThrow("UTF-8");
  });
});
