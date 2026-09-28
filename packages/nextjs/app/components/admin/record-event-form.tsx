"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  type ApiFailure,
  type ParcelSummary,
  fetchParcelSummary,
  proposeEvent,
} from "@/lib/admin/api";
import type { SubmissionDto } from "@/lib/approvals/dto";
import {
  EMPTY_EVENT_FORM,
  type EventForm,
  type FormErrors,
  fieldForPath,
  toEventPayload,
  validateEventForm,
} from "@/lib/admin/validation";
import { parseTrackingId } from "@/lib/hashing/sha256";
import { useAdmin } from "./admin-context";
import { EventFields } from "./event-fields";
import { Field, FormSection } from "./field";
import { ProposalCreated } from "./proposal-created";
import { SIGN_IN_FIRST, SubmitButton, SubmitError } from "./submit-feedback";

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; summary: ParcelSummary }
  | { state: "missing"; message: string };

const HASH_ERROR = "must be exactly 64 lower-case hexadecimal characters";

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

const toLookup = (result: Awaited<ReturnType<typeof fetchParcelSummary>>): Lookup =>
  result.ok
    ? { state: "found", summary: result.data }
    : { state: "missing", message: result.message };

export function RecordEventForm({ initialParcelHash }: { initialParcelHash: string }) {
  const { adminAccountId } = useAdmin();
  const [rawHash, setRawHash] = useState(initialParcelHash);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [event, setEvent] = useState<EventForm>(EMPTY_EVENT_FORM);
  const [errors, setErrors] = useState<FormErrors<EventForm>>({});
  const [hashError, setHashError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [proposal, setProposal] = useState<SubmissionDto | null>(null);

  const look = useCallback(async (hash: string) => {
    setLookup({ state: "loading" });
    setLookup(toLookup(await fetchParcelSummary(hash)));
  }, []);

  useEffect(() => {
    const hash = parseTrackingId(initialParcelHash);
    if (!hash) return;
    let cancelled = false;
    fetchParcelSummary(hash).then((result) => {
      if (!cancelled) setLookup(toLookup(result));
    });
    return () => {
      cancelled = true;
    };
  }, [initialParcelHash]);

  function onHashBlur() {
    const hash = parseTrackingId(rawHash);
    setHashError(rawHash && !hash ? HASH_ERROR : undefined);
    if (hash) void look(hash);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parcelHash = parseTrackingId(rawHash);
    const eErrors = validateEventForm(event);
    setHashError(parcelHash ? undefined : HASH_ERROR);
    setErrors(eErrors);
    setFailure(null);
    if (!parcelHash || Object.keys(eErrors).length) return;
    if (!adminAccountId) {
      setFailure(SIGN_IN_FIRST);
      return;
    }

    setPending(true);
    const result = await proposeEvent({ parcelHash, event: toEventPayload(event) });
    setPending(false);

    if (result.ok) {
      setProposal(result.data.submission);
      return;
    }
    setFailure(result);
    const field = result.path ? fieldForPath(result.path) : null;
    if (field && field in event) setErrors({ [field]: result.message });
  }

  function another() {
    setProposal(null);
    setEvent(EMPTY_EVENT_FORM);
    const hash = parseTrackingId(rawHash);
    if (hash) void look(hash);
  }

  if (proposal) {
    return (
      <ProposalCreated
        submission={proposal}
        onAnother={another}
        anotherLabel="Propose another event"
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
            placeholder="64 lower-case hexadecimal characters"
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
        <SubmitButton pending={pending} disabled={!adminAccountId}>
          Propose event for approval
        </SubmitButton>
      </div>
    </form>
  );
}
