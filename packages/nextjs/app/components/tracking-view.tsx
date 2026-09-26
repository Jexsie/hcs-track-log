"use client";

import type { TimelineDto } from "@/lib/timeline/dto";
import { EventCard } from "./event-card";
import { ParcelSummary } from "./parcel-summary";
import styles from "./tracking-view.module.css";
import { useVerification } from "./use-verification";
import { VerificationBanner } from "./verification-banner";

/** Database-first timeline, rendered immediately; ledger verification streams in per event. */
export function TrackingView({
  timeline,
  topicId,
  mirrorBaseUrl,
}: {
  timeline: TimelineDto;
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
    <div className={styles.view}>
      <VerificationBanner
        counts={counts}
        done={verification.done}
        error={verification.error}
        topicId={topicId}
        onRetry={verification.retry}
      />
      <ParcelSummary
        parcelHash={timeline.parcelHash}
        parcel={timeline.parcel}
        verdict={verification.parcel}
      />
      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className={styles.heading}>
          Shipment timeline <span>{timeline.events.length} events</span>
        </h2>
        <ol className={styles.timeline}>
          {timeline.events.map((event, i) => (
            <EventCard key={event.id} event={event} verdict={verification.events[i]} />
          ))}
        </ol>
      </section>
    </div>
  );
}
