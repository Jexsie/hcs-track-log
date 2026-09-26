const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Lower-case hex SHA-256 via WebCrypto, so it runs identically in Node and the browser. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The only accepted wire/storage format: 64 lower-case hex characters, no prefix. */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

/**
 * Accept a tracking ID only as typed: surrounding whitespace (a paste artifact) is trimmed, and
 * nothing else is changed. No case folding, no 0x stripping, no prefix or fuzzy matching, so an
 * ID that is not exactly right simply finds nothing. Returns null for anything else.
 */
export function parseTrackingId(raw: string): string | null {
  const value = raw.trim();
  return isSha256Hex(value) ? value : null;
}
