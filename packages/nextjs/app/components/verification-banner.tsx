import type { ReactNode } from "react";

export interface BannerCounts {
  total: number;
  verified: number;
  tampered: number;
  unavailable: number;
  parcelTampered: boolean;
}

type Tone = "pending" | "verified" | "tampered" | "unavailable";

const TONE: Record<Tone, { box: string; title: string; body: string }> = {
  pending: { box: "border border-line bg-surface", title: "text-accent", body: "text-muted" },
  verified: { box: "border border-ok bg-ok-soft", title: "text-ok", body: "text-muted" },
  tampered: { box: "border-2 border-danger bg-danger-soft", title: "text-danger", body: "text-fg" },
  unavailable: { box: "border border-warn bg-warn-soft", title: "text-warn", body: "text-muted" },
};

function Banner({
  tone,
  title,
  children,
  alert,
  action,
  lead,
}: {
  tone: Tone;
  title: string;
  children: ReactNode;
  alert?: boolean;
  action?: ReactNode;
  lead?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      className={`sticky top-3 z-10 flex items-center gap-3.5 overflow-hidden rounded-xl px-4 py-3.5 shadow-[0_6px_24px_rgb(0_0_0/0.08)] ${t.box}`}
      role={alert ? "alert" : "status"}
      aria-live={alert ? undefined : "polite"}
    >
      {lead}
      <div>
        <strong className={`block ${t.title}`}>{title}</strong>
        <p className={`mt-0.5 mb-0 text-sm ${t.body}`}>{children}</p>
      </div>
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
      className="ml-auto cursor-pointer rounded-lg border border-line bg-surface px-3.5 py-2 font-semibold text-fg"
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
  topicId,
  onRetry,
}: {
  counts: BannerCounts;
  done: boolean;
  error: string | null;
  topicId: string;
  onRetry: () => void;
}) {
  if (!done) {
    const checked = counts.verified + counts.tampered + counts.unavailable;
    return (
      <Banner
        tone="pending"
        title="Verifying live ledger integrity…"
        lead={
          <span
            className="size-3.5 flex-none animate-pulse-ring rounded-full bg-accent motion-reduce:animate-none"
            aria-hidden
          />
        }
      >
        Recomputing each event hash and comparing it with topic {topicId} ({checked}/{counts.total}{" "}
        checked)
      </Banner>
    );
  }
  if (error) {
    return (
      <Banner
        tone="unavailable"
        title="Verification could not complete"
        alert
        action={<RetryButton onRetry={onRetry} />}
      >
        {error}
      </Banner>
    );
  }
  if (counts.tampered > 0 || counts.parcelTampered) {
    const parts = [
      counts.tampered > 0 ? `${counts.tampered} of ${counts.total} events` : null,
      counts.parcelTampered ? "the parcel details" : null,
    ].filter(Boolean);
    return (
      <Banner tone="tampered" title="⚠️ Security warning: this record has been altered" alert>
        {parts.join(" and ")} no longer match what was anchored on the Hedera ledger. Do not rely on
        them.
      </Banner>
    );
  }
  if (counts.unavailable > 0) {
    return (
      <Banner
        tone="unavailable"
        title="Partially verified"
        action={<RetryButton onRetry={onRetry} />}
      >
        {counts.verified} of {counts.total} events verified; the mirror node did not answer for{" "}
        {counts.unavailable}.
      </Banner>
    );
  }
  return (
    <Banner
      tone="verified"
      title={`✅ All ${counts.total} events verified against the Hedera ledger`}
    >
      Every hash was recomputed in your browser from the displayed data and matched topic {topicId}.
    </Banner>
  );
}
