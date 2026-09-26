import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Notice, PageShell } from "@/app/components/page-shell";
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

function NoticePage({
  title,
  children,
  value,
}: {
  title: string;
  children: ReactNode;
  value?: string;
}) {
  return (
    <PageShell>
      <Notice title={title}>{children}</Notice>
      <SearchForm initialValue={value} />
    </PageShell>
  );
}

export default async function TrackPage({ params }: TrackPageProps) {
  const { parcelHash: raw } = await params;
  const parcelHash = normalizeHashInput(decodeURIComponent(raw));
  if (!parcelHash) {
    return (
      <NoticePage title="That is not a tracking ID" value={raw}>
        <p>A tracking ID is 64 hexadecimal characters.</p>
      </NoticePage>
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
      <NoticePage title="Verification is not configured">
        <p>The server has no HCS topic configured, so events cannot be verified.</p>
      </NoticePage>
    );
  }

  const timeline = await loadTimeline(getReader(), parcelHash);
  if (!timeline) {
    return (
      <NoticePage title="No parcel with this tracking ID" value={parcelHash}>
        <p>Check the ID and try again.</p>
      </NoticePage>
    );
  }

  return (
    <PageShell>
      <SearchForm initialValue={parcelHash} />
      <TrackingView timeline={timeline} topicId={topicId} mirrorBaseUrl={mirrorBaseUrl} />
    </PageShell>
  );
}
