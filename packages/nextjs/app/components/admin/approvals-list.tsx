"use client";

import { useEffect, useState } from "react";
import { listSubmissions } from "@/lib/admin/api";
import type { SubmissionDto } from "@/lib/approvals/dto";
import { useAdmin } from "./admin-context";
import { ApprovalCard } from "./approval-card";

type ListState =
  | { status: "loading" }
  | { status: "ready"; submissions: SubmissionDto[] }
  | { status: "error"; message: string };

export function ApprovalsList() {
  const { adminAccountId, sessionChecked } = useAdmin();
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!adminAccountId) return;
    let cancelled = false;
    listSubmissions().then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", submissions: result.data.submissions }
          : { status: "error", message: result.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [adminAccountId, reload]);

  if (!sessionChecked) return <p className="m-0 text-muted">Checking your session…</p>;
  if (!adminAccountId) {
    return (
      <p className="m-0 rounded-xl border border-line bg-surface p-5 text-muted">
        Connect your wallet and sign in to see pending approvals.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">
          {state.status === "ready"
            ? `${state.submissions.length} awaiting approval`
            : state.status === "error"
              ? state.message
              : "Loading…"}
        </span>
        <button
          type="button"
          onClick={() => setReload((n) => n + 1)}
          className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg"
        >
          Refresh
        </button>
      </div>
      {state.status === "ready" && state.submissions.length === 0 && (
        <p className="m-0 rounded-xl border border-line bg-surface p-5 text-muted">
          Nothing is waiting for approval.
        </p>
      )}
      {state.status === "ready" &&
        state.submissions.map((s) => <ApprovalCard key={s.id} submission={s} />)}
    </div>
  );
}
