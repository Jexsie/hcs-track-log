"use client";

import { type FormEvent, useState } from "react";
import { type ApiFailure, proposeRegistration } from "@/lib/admin/api";
import type { SubmissionDto } from "@/lib/approvals/dto";
import {
  EMPTY_EVENT_FORM,
  EMPTY_PARCEL_FORM,
  type EventForm,
  type FormErrors,
  type ParcelForm,
  fieldForPath,
  toEventPayload,
  toParcelPayload,
  validateEventForm,
  validateParcelForm,
} from "@/lib/admin/validation";
import { useAdmin } from "./admin-context";
import { EventFields } from "./event-fields";
import { Field, FormSection } from "./field";
import { ProposalCreated } from "./proposal-created";
import { RecordEventForm } from "./record-event-form";
import { SIGN_IN_FIRST, SubmitButton, SubmitError } from "./submit-feedback";

const PACKAGE_TYPES = ["Box", "Pallet", "Bag", "Crate", "Drum", "Envelope", "Container"];

export function RegisterParcelForm() {
  const { adminAccountId } = useAdmin();
  const [parcel, setParcel] = useState<ParcelForm>(EMPTY_PARCEL_FORM);
  const [event, setEvent] = useState<EventForm>({ ...EMPTY_EVENT_FORM, status: "Booked" });
  const [parcelErrors, setParcelErrors] = useState<FormErrors<ParcelForm>>({});
  const [eventErrors, setEventErrors] = useState<FormErrors<EventForm>>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [proposal, setProposal] = useState<SubmissionDto | null>(null);
  const [nextEventFor, setNextEventFor] = useState<string | null>(null);

  const set = (key: keyof ParcelForm) => (e: { target: { value: string } }) =>
    setParcel({ ...parcel, [key]: e.target.value });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pErrors = validateParcelForm(parcel);
    const eErrors = validateEventForm(event);
    setParcelErrors(pErrors);
    setEventErrors(eErrors);
    setFailure(null);
    if (Object.keys(pErrors).length || Object.keys(eErrors).length) return;
    if (!adminAccountId) {
      setFailure(SIGN_IN_FIRST);
      return;
    }

    setPending(true);
    const result = await proposeRegistration({
      parcel: toParcelPayload(parcel),
      firstEvent: toEventPayload(event),
    });
    setPending(false);

    if (result.ok) {
      setProposal(result.data.submission);
      return;
    }
    setFailure(result);
    const field = result.path ? fieldForPath(result.path) : null;
    if (field && field in parcel) setParcelErrors({ [field]: result.message });
    else if (field) setEventErrors({ [field]: result.message });
  }

  function reset() {
    setParcel(EMPTY_PARCEL_FORM);
    setEvent({ ...EMPTY_EVENT_FORM, status: "Booked" });
    setProposal(null);
    setFailure(null);
  }

  if (nextEventFor) return <RecordEventForm initialParcelHash={nextEventFor} />;

  if (proposal) {
    return (
      <ProposalCreated
        submission={proposal}
        onAnother={reset}
        anotherLabel="Propose another parcel"
        onRecordNext={() => setNextEventFor(proposal.parcelHash)}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <fieldset disabled={pending} className="m-0 grid min-w-0 gap-5 border-0 p-0">
        <FormSection
          title="Consignment"
          description="Immutable. Together with the parties and booking ref, these form the tracking ID."
        >
          <Field
            name="description"
            label="Description"
            value={parcel.description}
            onChange={set("description")}
            error={parcelErrors.description}
            placeholder="Coffee beans, green, bagged"
            className="sm:col-span-2"
          />
          <Field
            name="packageCount"
            label="Packages"
            inputMode="numeric"
            value={parcel.packageCount}
            onChange={set("packageCount")}
            error={parcelErrors.packageCount}
            placeholder="12"
          />
          <Field
            name="packageType"
            label="Package type"
            value={parcel.packageType}
            onChange={set("packageType")}
            error={parcelErrors.packageType}
            suggestions={PACKAGE_TYPES}
            placeholder="Bag"
          />
          <Field
            name="grossMassKg"
            label="Gross mass"
            inputMode="decimal"
            suffix="kg"
            value={parcel.grossMassKg}
            onChange={set("grossMassKg")}
            error={parcelErrors.grossMassKg}
            placeholder="142.50"
            hint="Up to 2 decimal places"
          />
          <Field
            name="volumeCubicMeters"
            label="Volume"
            inputMode="decimal"
            suffix="m³"
            value={parcel.volumeCubicMeters}
            onChange={set("volumeCubicMeters")}
            error={parcelErrors.volumeCubicMeters}
            placeholder="0.85"
            hint="Up to 2 decimal places"
          />
        </FormSection>

        <FormSection title="Parties & booking">
          <Field
            name="shipper"
            label="Shipper"
            value={parcel.shipper}
            onChange={set("shipper")}
            error={parcelErrors.shipper}
            placeholder="Bugisu Coffee Co-op, Mbale"
          />
          <Field
            name="consignee"
            label="Consignee"
            value={parcel.consignee}
            onChange={set("consignee")}
            error={parcelErrors.consignee}
            placeholder="Hamburg Roasters GmbH"
          />
          <Field
            name="bookingRef"
            label="Booking reference"
            value={parcel.bookingRef}
            onChange={set("bookingRef")}
            error={parcelErrors.bookingRef}
            placeholder="BK-2026-000184"
            hint="Makes identical shipments get different tracking IDs."
            className="sm:col-span-2"
          />
        </FormSection>

        <EventFields title="First event" value={event} errors={eventErrors} onChange={setEvent} />
      </fieldset>

      {failure && <SubmitError failure={failure} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton pending={pending} disabled={!adminAccountId}>
          Propose registration for approval
        </SubmitButton>
        <p className="m-0 text-sm text-muted">
          Only <code className="font-mono">{"{ v, parcelHash, payloadHash }"}</code> goes on-chain,
          and only after enough administrators approve it in their wallets.
        </p>
      </div>
    </form>
  );
}
