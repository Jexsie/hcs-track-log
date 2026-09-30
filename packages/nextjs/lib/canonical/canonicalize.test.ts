import { describe, expect, it } from "vitest";
import { canonicalize } from "./canonicalize";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("canonicalize", () => {
  it("sorts keys lexicographically at every level with compact separators", () => {
    const bytes = canonicalize({ z: "1", a: { y: "2", b: "3" }, m: 4 });

    expect(text(bytes)).toBe('{"a":{"b":"3","y":"2"},"m":4,"z":"1"}');
  });

  it("is independent of input key order", () => {
    const a = canonicalize({ status: "x", carrier: { scacCode: "A", name: "B" } });
    const b = canonicalize({ carrier: { name: "B", scacCode: "A" }, status: "x" });

    expect(a).toEqual(b);
  });

  it("encodes as UTF-8 bytes, not escapes", () => {
    const bytes = canonicalize({ location: "Café" });

    expect(Array.from(bytes.slice(-4))).toEqual([0xc3, 0xa9, 0x22, 0x7d]); // é " }
  });

  it("escapes quotes and control characters per JSON", () => {
    expect(text(canonicalize({ k: 'a"b\\c\n' }))).toBe('{"k":"a\\"b\\\\c\\n"}');
  });

  it.each([1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects non-safe-integer number %j",
    (n) => {
      expect(() => canonicalize({ n })).toThrow("safe integers");
    },
  );
});
