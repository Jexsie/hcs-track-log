/**
 * Display order for the public timeline: latest ledger event first. Pairs each event with its
 * verdict BEFORE sorting, so a verdict can never be shown next to the wrong event. Sequence numbers
 * are compared as bigints (they can exceed Number.MAX_SAFE_INTEGER).
 */
export function newestFirst<E extends { hcsSequenceNumber: string }, V>(
  events: readonly E[],
  verdicts: readonly (V | undefined)[],
): { event: E; verdict: V | undefined }[] {
  return events
    .map((event, i) => ({ event, verdict: verdicts[i] }))
    .sort((a, b) => {
      const x = BigInt(a.event.hcsSequenceNumber);
      const y = BigInt(b.event.hcsSequenceNumber);

      return x === y ? 0 : x < y ? 1 : -1;
    });
}
