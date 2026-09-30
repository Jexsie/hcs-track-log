"use client";

import { type FormEvent, useState } from "react";
import type { LedgerLinks } from "@/lib/server/ledger-links";
import { type LookupResult, lookupTimeline } from "@/lib/timeline/lookup-client";
import { SearchIcon } from "./icons";
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
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={onSubmit}
        role="search"
        noValidate
        autoComplete="off"
      >
        <label htmlFor="tracking-id" className="sr-only">
          Tracking ID
        </label>
        <div className="relative flex min-w-0 flex-1 items-center">
          <SearchIcon className="pointer-events-none absolute left-3.5 size-5 text-muted" />
          <input
            id="tracking-id"
            name="trackingId"
            className="w-full min-w-0 rounded-xl border border-line bg-surface py-3.5 pr-3.5 pl-11 text-base text-fg shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter tracking ID"
            spellCheck={false}
          />
        </div>
        <button
          className="cursor-pointer rounded-xl bg-accent px-7 py-3.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={state.status === "loading" || value.trim() === ""}
        >
          {state.status === "loading" ? "Searching…" : "Track"}
        </button>
      </form>

      {state.status === "not-found" && (
        <Notice title="No shipment found" alert>
          <p className="m-0 text-muted">Check the tracking ID and try again.</p>
        </Notice>
      )}
      {state.status === "error" && (
        <Notice title="Something went wrong" alert>
          <p className="m-0 text-muted">Please try again in a moment.</p>
        </Notice>
      )}
      {state.status === "found" &&
        (ledger ? (
          <TrackingView
            key={state.timeline.parcelHash}
            timeline={state.timeline}
            network={ledger.network}
            topicId={ledger.topicId}
            mirrorBaseUrl={ledger.mirrorBaseUrl}
          />
        ) : (
          <Notice title="Tracking is unavailable">
            <p className="m-0 text-muted">Please try again later.</p>
          </Notice>
        ))}
    </div>
  );
}
