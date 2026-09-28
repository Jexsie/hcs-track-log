"use client";

import type { TimelineDto } from "@/lib/timeline/dto";
import type { HederaNetwork } from "@/lib/wallet/hip820";
import { newestFirst } from "@/lib/timeline/order";
import { EventCard } from "./event-card";
import { ParcelSummary } from "./parcel-summary";
import { useVerification } from "./use-verification";
import { VerificationBanner } from "./verification-banner";

/** Database-first timeline, rendered immediately; ledger verification streams in per event. */
export function TrackingView({
  timeline,
  network,
  topicId,
  mirrorBaseUrl,
}: {
  timeline: TimelineDto;
  network: HederaNetwork;
  topicId: string;
  mirrorBaseUrl: string;
}) {
  const verification = useVerification(timeline, topicId, mirrorBaseUrl);
  const counts = {
    total: timeline.events.length,
    verified: 0,
    tampered: 0,
    unavailable: 0,
    parcelTampered: verification.parcel?.status === "tampered",
  };
  for (const v of verification.events) if (v) counts[v.status]++;
  const stops = newestFirst(timeline.events, verification.events);

  return (
    <div className="grid gap-5">
      <VerificationBanner
        counts={counts}
        done={verification.done}
        error={verification.error}
        onRetry={verification.retry}
      />
      <ParcelSummary
        parcelHash={timeline.parcelHash}
        parcel={timeline.parcel}
        latest={stops[0]?.event.content ?? null}
        verdict={verification.parcel}
      />
      <section
        aria-labelledby="timeline-heading"
        className="rounded-2xl border border-line bg-surface p-5 sm:p-6"
      >
        <h2 id="timeline-heading" className="mt-1 mb-4 text-base font-bold">
          Journey <span className="font-normal text-muted">· {timeline.events.length} updates</span>
        </h2>
        <ol className="m-0 p-0">
          {stops.map(({ event, verdict }, i) => (
            <EventCard
              key={event.id}
              event={event}
              verdict={verdict}
              network={network}
              topicId={topicId}
              latest={i === 0}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}
