import { ValidationError } from "@/lib/canonical/errors";
import { computeParcelHash } from "@/lib/hashing/parcel-hash";
import type { MirrorClient } from "@/lib/mirror/mirror-client";
import type { EventVerdict, ParcelVerdict } from "./verdicts";
import { type EventToVerify, verifyEvent } from "./verify-event";

/** Recompute the tracking ID from the stored parcel content and compare it to the searched ID. */
export async function verifyParcelContent(
  searchedParcelHash: string,
  content: unknown,
): Promise<ParcelVerdict> {
  let recomputed: string;
  try {
    recomputed = await computeParcelHash(content);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return {
      status: "tampered",
      reason: "invalid-content",
      message: `stored parcel content is invalid (${error.message})`,
      recomputedParcelHash: null,
    };
  }
  return recomputed === searchedParcelHash
    ? { status: "verified", parcelHash: recomputed }
    : {
        status: "tampered",
        reason: "content-mismatch",
        message: "stored parcel content does not hash to this tracking ID",
        recomputedParcelHash: recomputed,
      };
}

export interface TimelineReport {
  parcel: ParcelVerdict;
  /** Same order as the input events. */
  events: EventVerdict[];
  summary: Record<EventVerdict["status"], number>;
}

export interface VerifyTimelineOptions {
  parcelHash: string;
  parcel: unknown;
  events: readonly EventToVerify[];
  mirror: Pick<MirrorClient, "getMessage" | "messageUrl">;
  /** Parallel mirror requests (be polite to public mirror nodes). */
  concurrency?: number;
  onEvent?: (verdict: EventVerdict, index: number) => void;
}

export async function verifyTimeline({
  parcelHash,
  parcel,
  events,
  mirror,
  concurrency = 4,
  onEvent,
}: VerifyTimelineOptions): Promise<TimelineReport> {
  const verdicts: EventVerdict[] = new Array(events.length);
  let next = 0;
  const worker = async () => {
    while (next < events.length) {
      const index = next++;
      const event = events[index];
      if (!event) continue;
      const verdict = await verifyEvent(parcelHash, event, mirror);
      verdicts[index] = verdict;
      onEvent?.(verdict, index);
    }
  };
  const [parcelVerdict] = await Promise.all([
    verifyParcelContent(parcelHash, parcel),
    ...Array.from({ length: Math.max(1, Math.min(concurrency, events.length)) }, worker),
  ]);

  const summary = { verified: 0, tampered: 0, unavailable: 0 };
  for (const v of verdicts) summary[v.status]++;
  return { parcel: parcelVerdict, events: verdicts, summary };
}
