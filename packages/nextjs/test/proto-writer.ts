/** Minimal protobuf writers, test-only, for faking wallet and mirror-node payloads. */
export function varint(n: number): number[] {
  const out: number[] = [];
  let v = n;

  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }

  out.push(v);

  return out;
}

export const lenField = (field: number, bytes: Uint8Array | number[]) => [
  ...varint((field << 3) | 2),
  ...varint(bytes.length),
  ...bytes,
];

export const varintField = (field: number, value: number) => [
  ...varint(field << 3),
  ...varint(value),
];

/** SchedulableTransactionBody{ consensusSubmitMessage(21){ topicID(1){ topicNum(3) }, message(2) } } */
export function scheduledTopicMessageBody(topicNum: number, message: Uint8Array): Uint8Array {
  const submit = [...lenField(1, varintField(3, topicNum)), ...lenField(2, message)];

  return new Uint8Array(lenField(21, submit));
}
