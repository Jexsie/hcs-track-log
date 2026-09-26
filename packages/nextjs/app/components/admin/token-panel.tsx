"use client";

import { type FormEvent, useState } from "react";
import { useSubmitterToken } from "./use-submitter-token";

export function TokenPanel() {
  const [token, setToken] = useSubmitterToken();
  const [draft, setDraft] = useState("");

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setToken(draft.trim());
    setDraft("");
  }

  if (token) {
    return (
      <section
        className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3"
        aria-label="Submitter token"
      >
        <span className="rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
          Token set
        </span>
        <span className="text-sm text-muted">
          Submissions are authorized for this browser tab only (…{token.slice(-4)}).
        </span>
        <button
          type="button"
          onClick={() => setToken("")}
          className="ml-auto cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg"
        >
          Forget token
        </button>
      </section>
    );
  }

  return (
    <form
      onSubmit={onSave}
      className="grid gap-2 rounded-xl border-2 border-dashed border-accent bg-surface px-4 py-3.5"
      aria-label="Submitter token"
    >
      <label htmlFor="submitter-token" className="text-sm font-semibold">
        Submitter API token
      </label>
      <p className="m-0 text-sm text-muted">
        Paste <code className="font-mono">SUBMITTER_API_TOKEN</code>. It is kept only for this tab
        and sent only to this app&apos;s API, which co-signs each submission with the topic&apos;s
        submit keys.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="submitter-token"
          type="password"
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3.5 py-2.5 font-mono text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button
          type="submit"
          disabled={draft.trim().length === 0}
          className="cursor-pointer rounded-[10px] bg-accent px-5 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Use token
        </button>
      </div>
    </form>
  );
}
