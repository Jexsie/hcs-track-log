"use client";

import { useEffect, useRef, useState } from "react";
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
      if (!r.ok) {
        setError(r.message);
        break;
      }
      setResult(r.data);
      if (r.data.status !== "pending") {
        if (r.data.status === "executed") onFinalized?.();
        break;
      }
      if (!r.data.awaitingMirror && i >= 3) break; // still waiting on other administrators
      await sleep(POLL_MS);
    }
    setPhase("idle");
    setReload((n) => n + 1);
  }

  async function onApprove() {
    setError(null);
    setPhase("approving");
    try {
      await approve(submission.scheduleId);
    } catch (e) {
      setError(`Wallet did not approve: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("idle");
      return;
    }
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
  useEffect(() => {
    if (!readyForAuto || autoStarted.current) return;
    autoStarted.current = true;
    void Promise.resolve().then(onApprove);
  });

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

  return (
    <article
      className="grid gap-4 rounded-[14px] border border-line bg-surface p-5"
      aria-busy={phase !== "idle"}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-lg font-bold">
          {submission.kind === "register-parcel" ? "Register parcel" : "Record event"}
        </h3>
        <span className="text-xs text-muted">
          Proposed by <span className="font-mono">{submission.proposedBy}</span> · expires{" "}
          {formatUtc(submission.expiresAt)}
        </span>
      </header>

      <SubmissionSummary submission={submission} />

      <div className="grid gap-2 rounded-[10px] bg-surface-2 px-3.5 py-3 text-sm">
        {ledger.status === "loading" && (
          <span className="text-muted">Reading the schedule from the mirror node…</span>
        )}
        {ledger.status === "waiting" && (
          <span className="text-muted">Waiting for the mirror node to index the new schedule…</span>
        )}
        {ledger.status === "error" && (
          <span className="text-danger">Could not read the schedule: {ledger.message}</span>
        )}
        {ledger.status === "ready" &&
          (ledger.check.ok ? (
            <span className="font-semibold text-ok">
              ✅ The scheduled ledger message matches this content (recomputed in your browser).
            </span>
          ) : (
            <span className="font-semibold text-danger" role="alert">
              ⚠️ Do not approve: {ledger.check.reason}.
            </span>
          ))}
        {progress && (
          <span>
            Approvals: <strong>{progress.approvals}</strong> of <strong>{progress.required}</strong>{" "}
            required · {progress.authorizedKeys} authorized keys
            {progress.alreadySignedByYou && " · you have approved"}
          </span>
        )}
        <span className="text-xs text-muted">
          Schedule{" "}
          <a
            className="font-mono"
            href={`${config.mirrorBaseUrl}/api/v1/schedules/${submission.scheduleId}`}
            target="_blank"
            rel="noreferrer"
          >
            {submission.scheduleId}
          </a>{" "}
          on topic <span className="font-mono">{config.topicId}</span>
        </span>
      </div>

      {executed && (
        <p
          className="m-0 rounded-[10px] bg-ok-soft px-3.5 py-3 font-semibold text-ok"
          role="status"
        >
          ✅ Executed and anchored at HCS sequence #{executed.hcsSequenceNumber}. The public tracker
          can now verify it.
        </p>
      )}
      {closed && (
        <p className="m-0 rounded-[10px] bg-danger-soft px-3.5 py-3 text-danger" role="alert">
          {closed.status === "expired" ? "Expired" : "Rejected"}: {closed.reason}
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
              ? "Approve in your wallet…"
              : phase === "finalizing"
                ? "Waiting for consensus…"
                : "Approve with wallet"}
          </button>
          <button
            type="button"
            onClick={() => settle(1)}
            disabled={phase !== "idle" || !adminAccountId}
            className="cursor-pointer rounded-[10px] border border-line bg-surface px-4 py-2.5 font-semibold text-fg disabled:opacity-50"
          >
            Check status
          </button>
          {wallet.status !== "connected" && (
            <span className="text-sm text-muted">Connect a wallet to approve.</span>
          )}
          {progress && wallet.status === "connected" && !progress.youCanApprove && (
            <span className="text-sm text-warn">
              Your wallet&apos;s key is not one of the topic&apos;s submit keys.
            </span>
          )}
        </div>
      )}
    </article>
  );
}
