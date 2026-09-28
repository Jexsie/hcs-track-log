/**
 * Minimal protobuf wire-format reader for the few Hedera messages this app must inspect
 * (signature maps, keys, scheduled topic messages). Input is untrusted (wallets, mirror node), so
 * every read is bounds-checked. Field numbers come from the SDK's own .proto files.
 */

export class ProtoDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtoDecodeError";
  }
}

export interface Field {
  number: number;
  /** Set for varint fields (wire type 0). */
  varint?: bigint;
  /** Set for length-delimited fields (wire type 2). */
  bytes?: Uint8Array;
}

function readVarint(buf: Uint8Array, offset: number): [bigint, number] {
  let result = 0n;
  for (let i = 0; i < 10; i++) {
    const byte = buf[offset + i];
    if (byte === undefined) throw new ProtoDecodeError("truncated varint");
    result |= BigInt(byte & 0x7f) << BigInt(7 * i);
    if ((byte & 0x80) === 0) return [result, offset + i + 1];
  }
  throw new ProtoDecodeError("varint longer than 10 bytes");
}

export function readFields(buf: Uint8Array): Field[] {
  const fields: Field[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const [tag, afterTag] = readVarint(buf, offset);
    const number = Number(tag >> 3n);
    const wireType = Number(tag & 7n);
    if (number === 0) throw new ProtoDecodeError("field number 0");
    offset = afterTag;
    switch (wireType) {
      case 0: {
        const [value, next] = readVarint(buf, offset);
        fields.push({ number, varint: value });
        offset = next;
        break;
      }
      case 1:
        offset += 8;
        break;
      case 2: {
        const [length, next] = readVarint(buf, offset);
        const end = next + Number(length);
        if (length > BigInt(buf.length) || end > buf.length)
          throw new ProtoDecodeError("length exceeds buffer");
        // Copy into a plain Uint8Array: callers never see a Node Buffer or share the input buffer.
        fields.push({ number, bytes: Uint8Array.from(buf.subarray(next, end)) });
        offset = end;
        break;
      }
      case 5:
        offset += 4;
        break;
      default:
        throw new ProtoDecodeError(`unsupported wire type ${wireType}`);
    }
    if (offset > buf.length) throw new ProtoDecodeError("fixed-width field exceeds buffer");
  }
  return fields;
}

export function optionalBytesField(buf: Uint8Array, number: number): Uint8Array | undefined {
  return readFields(buf).find((f) => f.number === number && f.bytes !== undefined)?.bytes;
}

export function bytesField(buf: Uint8Array, number: number): Uint8Array {
  const value = optionalBytesField(buf, number);
  if (!value) throw new ProtoDecodeError(`missing field ${number}`);
  return value;
}

/** Alias that reads better when the field holds an embedded message. */
export const messageField = bytesField;

export function repeatedBytesField(buf: Uint8Array, number: number): Uint8Array[] {
  return readFields(buf).flatMap((f) => (f.number === number && f.bytes ? [f.bytes] : []));
}

export function varintField(buf: Uint8Array, number: number): bigint | undefined {
  return readFields(buf).find((f) => f.number === number && f.varint !== undefined)?.varint;
}
