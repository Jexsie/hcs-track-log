"use client";

import { type FormEvent, useState } from "react";
import type { LedgerLinks } from "@/lib/server/ledger-links";
import { type LookupResult, lookupTimeline } from "@/lib/timeline/lookup-client";
import { Notice } from "./page-shell";
import { TrackingView } from "./tracking-view";

type SearchState = { status: "idle" } | { status: "loading" } | LookupResult;

/**
 * Tracking-ID search. The ID is POSTed in the request body and the timeline renders in place, so
 * it never appears in the address bar, browser history, server logs or Referer headers.
 */
export function TrackSearch({ ledger }: { ledger: LedgerLinks | null }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trackingId = value.trim();
    if (!trackingId) return;
    setState({ status: "loading" });
    setState(await lookupTimeline(trackingId));
  }

  return (
    <div className="grid gap-5">
      <form className="grid gap-2" onSubmit={onSubmit} role="search" noValidate autoComplete="off">
        <label htmlFor="tracking-id" className="text-sm font-semibold">
          Tracking ID
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="tracking-id"
            name="trackingId"
            className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3.5 py-3 font-mono text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="64 lower-case hexadecimal characters"
            spellCheck={false}
            aria-describedby="tracking-id-hint"
          />
          <button
            className="cursor-pointer rounded-[10px] bg-accent px-5.5 py-3 font-semibold text-white disabled:cursor-progress disabled:opacity-70"
            type="submit"
            disabled={state.status === "loading" || value.trim() === ""}
          >
            {state.status === "loading" ? "Searching…" : "Track"}
          </button>
        </div>
        <p id="tracking-id-hint" className="m-0 text-xs text-muted">
          IDs are matched exactly, character for character. There is no partial or fuzzy search.
        </p>
      </form>

      {state.status === "not-found" && (
        <Notice title="No parcel with this tracking ID" alert>
          <p className="m-0 text-muted">
            Nothing matches exactly what was entered. Check for a missing or mistyped character.
          </p>
        </Notice>
      )}
      {state.status === "error" && (
        <Notice title="Search failed" alert>
          <p className="m-0 text-muted">{state.message}</p>
        </Notice>
      )}
      {state.status === "found" &&
        (ledger ? (
          <TrackingView
            key={state.timeline.parcelHash}
            timeline={state.timeline}
            topicId={ledger.topicId}
            mirrorBaseUrl={ledger.mirrorBaseUrl}
          />
        ) : (
          <Notice title="Verification is not configured">
            <p className="m-0 text-muted">
              The server has no HCS topic configured, so events cannot be verified.
            </p>
          </Notice>
        ))}
    </div>
  );
}
