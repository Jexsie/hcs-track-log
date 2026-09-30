import { describe, expect, it } from "vitest";
import { FieldError } from "./errors";
import {
  normalizeDecimal,
  normalizePositiveInt,
  normalizeText,
  normalizeTimestamp,
} from "./normalize";

describe("normalizeText", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeText("  Kampala Hub \n")).toBe("Kampala Hub");
  });

  it("applies Unicode NFC so composed and decomposed forms are equal", () => {
    const decomposed = "Café Kigali";
    const composed = "Café Kigali";

    expect(normalizeText(decomposed)).toBe(composed);
    expect(normalizeText(composed)).toBe(composed);
  });

  it.each([undefined, null, "", "   "])("rejects missing value %j", (value) => {
    expect(() => normalizeText(value)).toThrow(FieldError);
  });

  it.each([42, true, {}, []])("rejects non-string %j", (value) => {
    expect(() => normalizeText(value)).toThrow("must be a string");
  });

  it("rejects malformed Unicode (lone surrogate)", () => {
    expect(() => normalizeText("bad \ud800 text")).toThrow("invalid Unicode");
  });
});

describe("normalizePositiveInt", () => {
  it.each([
    [12, 12],
    ["12", 12],
    [" 7 ", 7],
  ])("accepts %j", (input, expected) => {
    expect(normalizePositiveInt(input)).toBe(expected);
  });

  it.each([0, -1, 1.5, "1.5", "abc", "", Number.NaN, 2 ** 31, undefined])("rejects %j", (value) => {
    expect(() => normalizePositiveInt(value)).toThrow(FieldError);
  });
});

describe("normalizeDecimal (scale 2)", () => {
  it.each([
    ["142.5", "142.50"],
    [142.5, "142.50"],
    ["0.85", "0.85"],
    [0.85, "0.85"],
    ["0.850", "0.85"],
    ["00012", "12.00"],
    [12, "12.00"],
    ["0", "0.00"],
    [" 3.10 ", "3.10"],
    ["99999999.99", "99999999.99"],
  ])("serializes %j as fixed-scale %j", (input, expected) => {
    expect(normalizeDecimal(input)).toBe(expected);
  });

  it.each([
    ["1.005", "at most 2 decimal places"],
    [1.005, "at most 2 decimal places"],
    ["-1", "non-negative decimal"],
    ["1e3", "non-negative decimal"],
    [1e21, "non-negative decimal"],
    ["1.", "non-negative decimal"],
    [".5", "non-negative decimal"],
    ["123456789", "at most 8 integer digits"],
    [Number.NaN, "finite"],
    [Number.POSITIVE_INFINITY, "finite"],
  ])("rejects %j (%s)", (input, message) => {
    expect(() => normalizeDecimal(input)).toThrow(message);
  });
});

describe("normalizeTimestamp", () => {
  it.each([
    ["2026-09-25T11:40:00Z", "2026-09-25T11:40:00Z"],
    ["2026-09-25T11:40:00.000Z", "2026-09-25T11:40:00Z"],
    ["2026-09-25T14:40:00+03:00", "2026-09-25T11:40:00Z"],
    ["2026-09-25T06:10:00-05:30", "2026-09-25T11:40:00Z"],
    ["2026-12-31T23:30:00-01:00", "2027-01-01T00:30:00Z"],
    ["2028-02-29T00:00:00Z", "2028-02-29T00:00:00Z"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeTimestamp(input)).toBe(expected);
  });

  it("accepts a Date at whole-second precision", () => {
    expect(normalizeTimestamp(new Date(Date.UTC(2026, 8, 25, 11, 40, 0)))).toBe(
      "2026-09-25T11:40:00Z",
    );
  });

  it.each([
    ["2026-09-25T11:40:00", "UTC offset"],
    ["2026-09-25 11:40:00Z", "ISO-8601"],
    ["2026-09-25T11:40Z", "ISO-8601"],
    ["2026-09-25T11:40:00.5Z", "sub-second"],
    ["2026-02-30T00:00:00Z", "not a real"],
    ["2027-02-29T00:00:00Z", "not a real"],
    ["2026-09-25T24:00:00Z", "not a real"],
    ["2026-09-25T11:40:00+24:00", "not a real"],
  ])("rejects %j (%s)", (input, message) => {
    expect(() => normalizeTimestamp(input)).toThrow(message);
  });

  it("rejects a Date with milliseconds rather than truncating silently", () => {
    expect(() => normalizeTimestamp(new Date(Date.UTC(2026, 8, 25, 11, 40, 0, 250)))).toThrow(
      "sub-second",
    );
  });

  it("rejects an invalid Date and non-string input", () => {
    expect(() => normalizeTimestamp(new Date("nope"))).toThrow(FieldError);
    expect(() => normalizeTimestamp(1_758_800_400_000)).toThrow(FieldError);
    expect(() => normalizeTimestamp(undefined)).toThrow("is required");
  });
});
