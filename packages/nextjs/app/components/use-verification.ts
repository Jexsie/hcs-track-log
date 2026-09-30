"use client";

import { useCallback, useEffect, useState } from "react";
import { createMirrorClient } from "@/lib/mirror/mirror-client";
import { type TimelineDto, eventsToVerify } from "@/lib/timeline/dto";
import type { EventVerdict, ParcelVerdict } from "@/lib/verify/verdicts";
import { verifyTimeline } from "@/lib/verify/verify-timeline";

interface RunState {
  run: number;
  events: (EventVerdict | undefined)[];
  parcel: ParcelVerdict | null;
  error: string | null;
}

export interface VerificationState {
  /** One entry per timeline event; undefined while that event is still being checked. */
  events: (EventVerdict | undefined)[];
  parcel: ParcelVerdict | null;
  error: string | null;
  done: boolean;
  retry: () => void;
}

/**
 * Verify the timeline in the browser: recompute every hash from the served content and compare it
 * with the mirror node directly, so the check does not depend on trusting this app's server.
 */
export function useVerification(
  timeline: TimelineDto,
  topicId: string,
  mirrorBaseUrl: string,
): VerificationState {
  const [run, setRun] = useState(0);
  const [state, setState] = useState<RunState>({ run: -1, events: [], parcel: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const update = (patch: (s: RunState) => Partial<RunState>) =>
      setState((prev) => {
        if (cancelled) return prev;
        const base: RunState =
          prev.run === run ? prev : { run, events: [], parcel: null, error: null };

        return { ...base, ...patch(base) };
      });

    verifyTimeline({
      parcelHash: timeline.parcelHash,
      parcel: timeline.parcel,
      events: eventsToVerify(timeline),
      mirror: createMirrorClient({ baseUrl: mirrorBaseUrl, topicId }),
      onEvent: (verdict, index) =>
        update((s) => {
          const events = [...s.events];

          events[index] = verdict;

          return { events };
        }),
    })
      .then((report) => update(() => ({ parcel: report.parcel, events: report.events })))
      .catch((error: unknown) =>
        update(() => ({ error: error instanceof Error ? error.message : "verification failed" })),
      );

    return () => {
      cancelled = true;
    };
  }, [timeline, topicId, mirrorBaseUrl, run]);

  const retry = useCallback(() => setRun((n) => n + 1), []);
  const current = state.run === run ? state : { events: [], parcel: null, error: null };
  const done = current.error !== null || current.parcel !== null;

  return { ...current, done, retry };
}
