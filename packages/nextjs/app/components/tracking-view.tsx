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
        verdict={verification.parcel}
      />
      <section aria-labelledby="timeline-heading">
        <h2
          id="timeline-heading"
          className="mt-2 mb-3 flex items-baseline gap-2.5 text-lg font-bold"
        >
          Updates <span className="text-sm font-normal text-muted">latest first</span>
        </h2>
        <ol className="m-0 grid gap-4 p-0">
          {newestFirst(timeline.events, verification.events).map(({ event, verdict }) => (
            <EventCard
              key={event.id}
              event={event}
              verdict={verdict}
              network={network}
              topicId={topicId}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}
