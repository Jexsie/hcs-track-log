import type { ReactNode } from "react";

export interface BannerCounts {
  total: number;
  verified: number;
  tampered: number;
  unavailable: number;
  parcelTampered: boolean;
}

type Tone = "pending" | "verified" | "tampered" | "unavailable";

const TONE: Record<Tone, { box: string; text: string }> = {
  pending: { box: "border border-line bg-surface", text: "text-accent" },
  verified: { box: "border border-ok bg-ok-soft", text: "text-ok" },
  tampered: { box: "border-2 border-danger bg-danger-soft", text: "text-danger" },
  unavailable: { box: "border border-warn bg-warn-soft", text: "text-warn" },
};

function Banner({
  tone,
  children,
  alert,
  action,
  lead,
}: {
  tone: Tone;
  children: ReactNode;
  alert?: boolean;
  action?: ReactNode;
  lead?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      className={`sticky top-3 z-10 flex items-center gap-3 overflow-hidden rounded-xl px-4 py-3 shadow-[0_6px_24px_rgb(0_0_0/0.08)] ${t.box}`}
      role={alert ? "alert" : "status"}
      aria-live={alert ? undefined : "polite"}
    >
      {lead}
      <strong className={`text-sm ${t.text}`}>{children}</strong>
      {action}
      {tone === "pending" && (
        <span
          className="absolute bottom-0 left-0 h-[3px] w-[35%] animate-scan bg-accent motion-reduce:animate-none"
          aria-hidden
        />
      )}
    </div>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      className="ml-auto cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg"
      onClick={onRetry}
      type="button"
    >
      Retry
    </button>
  );
}

export function VerificationBanner({
  counts,
  done,
  error,
  onRetry,
}: {
  counts: BannerCounts;
  done: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (!done) {
    return (
      <Banner
        tone="pending"
        lead={
          <span
            className="size-3 flex-none animate-pulse-ring rounded-full bg-accent motion-reduce:animate-none"
            aria-hidden
          />
        }
      >
        Checking records…
      </Banner>
    );
  }
  if (error) {
    return (
      <Banner tone="unavailable" alert action={<RetryButton onRetry={onRetry} />}>
        Records could not be checked
      </Banner>
    );
  }
  if (counts.tampered > 0 || counts.parcelTampered) {
    return (
      <Banner tone="tampered" alert>
        Warning: some details were changed after they were recorded
      </Banner>
    );
  }
  if (counts.unavailable > 0) {
    return (
      <Banner tone="unavailable" action={<RetryButton onRetry={onRetry} />}>
        {counts.verified} of {counts.total} updates verified
      </Banner>
    );
  }
  return <Banner tone="verified">All updates verified</Banner>;
}
