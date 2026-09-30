"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { finalizeSubmission } from "@/lib/admin/api";
import type { FinalizeResultDto, SubmissionDto } from "@/lib/approvals/dto";
import { expectedEnvelope } from "@/lib/approvals/expected-envelope";
import {
  type ApprovalProgress,
  type ScheduleCheck,
  approvalProgress,
  checkScheduledMessage,
} from "@/lib/approvals/scheduled-check";
import { MirrorNotFoundError } from "@/lib/mirror/http";
import { type ScheduleState, fetchSchedule, fetchTopicKeys } from "@/lib/mirror/ledger-state";
import type { DecodedKey } from "@/lib/proto/hedera";
import { formatUtc } from "@/lib/timeline/format";
import { useAdmin } from "./admin-context";
import { SubmissionSummary } from "./submission-summary";

type LedgerView =
  | { status: "loading" }
  | { status: "waiting" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      schedule: ScheduleState;
      submitKey: DecodedKey | null;
      check: ScheduleCheck;
    };

const POLL_MS = 3_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ApprovalCard({
  submission,
  onFinalized,
  autoApprove = false,
}: {
  submission: SubmissionDto;
  onFinalized?: () => void;
  /** Ask the connected wallet to approve as soon as the schedule checks out (used for the proposer). */
  autoApprove?: boolean;
}) {
  const { config, wallet, adminAccountId, approve } = useAdmin();
  const [ledger, setLedger] = useState<LedgerView>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [phase, setPhase] = useState<"idle" | "approving" | "finalizing">("idle");
  const [result, setResult] = useState<FinalizeResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);
  const autoFinalized = useRef(false);
  // Polling outlives a click; stop it (and its state updates) once the card unmounts.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  // Read the schedule and the topic's submit key from the mirror node, and check the scheduled
  // message against an envelope recomputed from the content shown here: in the browser, not the server.
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchSchedule(config.mirrorBaseUrl, submission.scheduleId),
      fetchTopicKeys(config.mirrorBaseUrl, config.topicId),
      expectedEnvelope(submission),
    ])
      .then(([schedule, keys, expected]) => {
        if (cancelled) return;
        setLedger({
          status: "ready",
          schedule,
          submitKey: keys.submitKey,
          check: checkScheduledMessage(expected, schedule, config.topicId),
        });
      })
      .catch(async (e: unknown) => {
        if (cancelled) return;

        if (e instanceof MirrorNotFoundError) {
          setLedger({ status: "waiting" }); // a brand-new schedule takes a few seconds to reach the mirror node
          await sleep(POLL_MS);
          if (!cancelled) setReload((n) => n + 1);

          return;
        }

        setLedger({ status: "error", message: e instanceof Error ? e.message : String(e) });
      });

    return () => {
      cancelled = true;
    };
  }, [config.mirrorBaseUrl, config.topicId, submission, reload]);

  const progress: ApprovalProgress | null =
    ledger.status === "ready"
      ? approvalProgress(
          ledger.schedule.signerPublicKeys,
          ledger.submitKey,
          wallet.status === "connected" ? wallet.publicKey : null,
        )
      : null;

  async function settle(maxPolls: number) {
    setPhase("finalizing");

    for (let i = 0; i < maxPolls; i++) {
      const r = await finalizeSubmission(submission.id);

      if (!mounted.current) return;

      if (!r.ok) {
        setError("Could not refresh. Try again.");
        break;
      }

      setResult(r.data);

      if (r.data.status !== "pending") {
        if (r.data.status === "executed") onFinalized?.();
        break;
      }

      if (!r.data.awaitingMirror && i >= 3) break; // still waiting on other administrators
      await sleep(POLL_MS);
      if (!mounted.current) return;
    }

    setPhase("idle");
    setReload((n) => n + 1);
  }

  async function onApprove() {
    setError(null);
    setPhase("approving");

    try {
      await approve(submission.scheduleId);
    } catch {
      if (!mounted.current) return;
      setError("Approval was cancelled or failed in your wallet.");
      setPhase("idle");

      return;
    }

    if (!mounted.current) return;
    await settle(20);
  }

  // The proposer's own approval is the first one: request it once the in-browser check has passed.
  const readyForAuto =
    autoApprove &&
    ledger.status === "ready" &&
    ledger.check.ok &&
    progress?.youCanApprove === true &&
    !progress.alreadySignedByYou &&
    phase === "idle";
  const startAutoApprove = useEffectEvent(() => {
    void Promise.resolve().then(onApprove);
  });

  useEffect(() => {
    if (!readyForAuto || autoStarted.current) return;
    autoStarted.current = true;
    startAutoApprove();
  }, [readyForAuto]);

  // Finalizing is what caches an executed change for the tracker, and it runs only from this card.
  // If the network already executed it (the approver left before polling finished), finish it now.
  const readyToFinalize =
    ledger.status === "ready" &&
    ledger.schedule.executedTimestamp !== null &&
    result === null &&
    phase === "idle";
  const startFinalize = useEffectEvent(() => {
    void Promise.resolve().then(() => settle(20));
  });

  useEffect(() => {
    if (!readyToFinalize || autoFinalized.current) return;
    autoFinalized.current = true;
    startFinalize();
  }, [readyToFinalize]);

  const executed = result?.status === "executed" ? result : null;
  const closed =
    result && (result.status === "expired" || result.status === "rejected") ? result : null;
  const canApprove =
    ledger.status === "ready" &&
    ledger.check.ok &&
    progress?.youCanApprove === true &&
    !progress.alreadySignedByYou &&
    phase === "idle" &&
    !executed &&
    !closed;

  const status = (() => {
    if (ledger.status === "loading" || ledger.status === "waiting") {
      return { tone: "text-muted", text: "Checking…" };
    }

    if (ledger.status === "error") {
      return { tone: "text-danger", text: "This change could not be checked. Try again." };
    }

    return ledger.check.ok
      ? { tone: "text-ok", text: "Details match" }
      : { tone: "text-danger", text: "Do not approve: these details have been changed." };
  })();

  return (
    <article
      className="grid gap-3 rounded-xl border border-line bg-surface p-4"
      aria-busy={phase !== "idle"}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-lg font-bold">
          {submission.kind === "register-parcel" ? "New shipment" : "Update"}
        </h3>
        <span className="text-xs text-muted">
          By {submission.proposedBy} · expires {formatUtc(submission.expiresAt)}
        </span>
      </header>

      <SubmissionSummary submission={submission} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span
          className={`font-semibold ${status.tone}`}
          role={ledger.status === "ready" && !ledger.check.ok ? "alert" : undefined}
        >
          {status.text}
        </span>
        {progress && (
          <span className="text-muted">
            {progress.approvals} of {progress.required} approvals
            {progress.alreadySignedByYou && " · you approved"}
          </span>
        )}
      </div>

      {executed && (
        <p
          className="m-0 rounded-[10px] bg-ok-soft px-3.5 py-3 font-semibold text-ok"
          role="status"
        >
          Approved. Customers can now see this.
        </p>
      )}
      {closed && (
        <p
          className="m-0 rounded-[10px] bg-danger-soft px-3.5 py-3 font-semibold text-danger"
          role="alert"
        >
          {closed.status === "expired"
            ? "Expired before it was approved."
            : "Rejected: the details did not match."}
        </p>
      )}
      {error && (
        <p className="m-0 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {!executed && !closed && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={!canApprove}
            className="cursor-pointer rounded-[10px] bg-accent px-5 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "approving"
              ? "Confirm in your wallet…"
              : phase === "finalizing"
                ? "Finishing…"
                : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => settle(1)}
            disabled={phase !== "idle" || !adminAccountId}
            className="cursor-pointer rounded-[10px] border border-line bg-surface px-4 py-2.5 font-semibold text-fg disabled:opacity-50"
          >
            Refresh
          </button>
          {wallet.status !== "connected" && (
            <span className="text-sm text-muted">Connect your wallet to approve.</span>
          )}
          {progress && wallet.status === "connected" && !progress.youCanApprove && (
            <span className="text-sm text-warn">This wallet can&apos;t approve changes.</span>
          )}
        </div>
      )}
    </article>
  );
}
