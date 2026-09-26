"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  type ApiResult,
  type ParcelSummary,
  fetchParcelSummary,
  recordEvent,
} from "@/lib/admin/api";
import {
  EMPTY_EVENT_FORM,
  type EventForm,
  type FormErrors,
  fieldForPath,
  toEventPayload,
  validateEventForm,
} from "@/lib/admin/validation";
import { normalizeHashInput } from "@/lib/hashing/sha256";
import type { LedgerLinks } from "@/lib/server/ledger-links";
import { envelopeFor } from "./envelope-preview";
import { EventFields } from "./event-fields";
import { Field, FormSection } from "./field";
import { type SubmissionOutcome, SubmissionResult } from "./submission-result";
import { SubmitButton, SubmitError } from "./submit-feedback";
import { useSubmitterToken } from "./use-submitter-token";

type Failure = Extract<ApiResult<unknown>, { ok: false }>;
type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; summary: ParcelSummary }
  | { state: "missing"; message: string };

function LookupStatus({ lookup }: { lookup: Lookup }) {
  if (lookup.state === "loading")
    return <p className="m-0 text-sm text-muted">Looking up parcel…</p>;
  if (lookup.state === "missing")
    return <p className="m-0 text-sm text-danger">{lookup.message}</p>;
  if (lookup.state !== "found") return null;
  const { summary } = lookup;
  return (
    <p className="m-0 rounded-[10px] bg-surface-2 px-3 py-2 text-sm">
      <strong>{summary.description}</strong> · {summary.eventCount} events
      {summary.latest && (
        <>
          {" "}
          · latest: {summary.latest.status} at {summary.latest.location} (#
          {summary.latest.hcsSequenceNumber})
        </>
      )}
    </p>
  );
}

export function RecordEventForm({
  initialParcelHash,
  ledger,
}: {
  initialParcelHash: string;
  ledger: LedgerLinks | null;
}) {
  const [token] = useSubmitterToken();
  const [rawHash, setRawHash] = useState(initialParcelHash);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [event, setEvent] = useState<EventForm>(EMPTY_EVENT_FORM);
  const [errors, setErrors] = useState<FormErrors<EventForm>>({});
  const [hashError, setHashError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [outcome, setOutcome] = useState<SubmissionOutcome | null>(null);

  const look = useCallback(async (hash: string) => {
    setLookup({ state: "loading" });
    const result = await fetchParcelSummary(hash);
    setLookup(
      result.ok
        ? { state: "found", summary: result.data }
        : { state: "missing", message: result.message },
    );
  }, []);

  useEffect(() => {
    const hash = normalizeHashInput(initialParcelHash);
    if (!hash) return;
    let cancelled = false;
    fetchParcelSummary(hash).then((result) => {
      if (!cancelled)
        setLookup(
          result.ok
            ? { state: "found", summary: result.data }
            : { state: "missing", message: result.message },
        );
    });
    return () => {
      cancelled = true;
    };
  }, [initialParcelHash]);

  function onHashBlur() {
    const hash = normalizeHashInput(rawHash);
    setHashError(rawHash && !hash ? "must be 64 hexadecimal characters" : undefined);
    if (hash) void look(hash);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parcelHash = normalizeHashInput(rawHash);
    const eErrors = validateEventForm(event);
    setHashError(parcelHash ? undefined : "must be 64 hexadecimal characters");
    setErrors(eErrors);
    setFailure(null);
    if (!parcelHash || Object.keys(eErrors).length) return;
    if (!token) {
      setFailure({
        ok: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "Enter the submitter API token first.",
      });
      return;
    }

    setPending(true);
    const payload = toEventPayload(event);
    const result = await recordEvent(token, parcelHash, payload);
    setPending(false);

    if (result.ok) {
      setOutcome({
        parcelHash,
        hcsSequenceNumber: result.data.hcsSequenceNumber,
        envelope: await envelopeFor(parcelHash, payload),
      });
      return;
    }
    setFailure(result);
    const field = result.path ? fieldForPath(result.path) : null;
    if (field && field in event) setErrors({ [field]: result.message });
  }

  function another() {
    setOutcome(null);
    setEvent(EMPTY_EVENT_FORM);
    const hash = normalizeHashInput(rawHash);
    if (hash) void look(hash);
  }

  if (outcome) {
    return (
      <SubmissionResult
        title="Event recorded"
        outcome={outcome}
        ledger={ledger}
        onAnother={another}
        anotherLabel="Record another event"
      />
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <fieldset disabled={pending} className="m-0 grid min-w-0 gap-5 border-0 p-0">
        <FormSection title="Parcel">
          <Field
            name="parcelHash"
            label="Tracking ID"
            value={rawHash}
            onChange={(e) => setRawHash(e.target.value)}
            onBlur={onHashBlur}
            error={hashError}
            placeholder="64 hexadecimal characters"
            spellCheck={false}
            autoComplete="off"
            inputClassName="font-mono"
            className="sm:col-span-2"
            hint={<LookupStatus lookup={lookup} />}
          />
        </FormSection>
        <EventFields title="New event" value={event} errors={errors} onChange={setEvent} />
      </fieldset>

      {failure && <SubmitError failure={failure} />}

      <div>
        <SubmitButton pending={pending}>Anchor event on Hedera</SubmitButton>
      </div>
    </form>
  );
}
