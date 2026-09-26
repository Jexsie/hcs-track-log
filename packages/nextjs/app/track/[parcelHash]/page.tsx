import type { Metadata } from "next";
import { SearchForm } from "@/app/components/search-form";
import { TrackingView } from "@/app/components/tracking-view";
import { ConfigError, readMirrorNodeUrl, readTopicId } from "@/lib/config/env";
import { normalizeHashInput } from "@/lib/hashing/sha256";
import { loadTimeline } from "@/lib/server/read-handlers";
import { getReader } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Track parcel — hcs-track-log" };

interface TrackPageProps {
  params: Promise<{ parcelHash: string }>;
}

function Notice({
  title,
  children,
  value,
}: {
  title: string;
  children: React.ReactNode;
  value?: string;
}) {
  return (
    <main className="container stack">
      <section className="notice">
        <h1>{title}</h1>
        {children}
      </section>
      <SearchForm initialValue={value} />
    </main>
  );
}

export default async function TrackPage({ params }: TrackPageProps) {
  const { parcelHash: raw } = await params;
  const parcelHash = normalizeHashInput(decodeURIComponent(raw));
  if (!parcelHash) {
    return (
      <Notice title="That is not a tracking ID" value={raw}>
        <p>A tracking ID is 64 hexadecimal characters.</p>
      </Notice>
    );
  }

  let topicId: string;
  let mirrorBaseUrl: string;
  try {
    topicId = readTopicId();
    mirrorBaseUrl = readMirrorNodeUrl();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return (
      <Notice title="Verification is not configured">
        <p>The server has no HCS topic configured, so events cannot be verified.</p>
      </Notice>
    );
  }

  const timeline = await loadTimeline(getReader(), parcelHash);
  if (!timeline) {
    return (
      <Notice title="No parcel with this tracking ID" value={parcelHash}>
        <p>Check the ID and try again.</p>
      </Notice>
    );
  }

  return (
    <main className="container stack">
      <SearchForm initialValue={parcelHash} />
      <TrackingView timeline={timeline} topicId={topicId} mirrorBaseUrl={mirrorBaseUrl} />
    </main>
  );
}
