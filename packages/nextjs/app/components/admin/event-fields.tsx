"use client";

import { toLocalInputValue } from "@/lib/admin/datetime";
import { BRAND } from "@/lib/brand";
import type { EventForm, FormErrors } from "@/lib/admin/validation";
import { Field, FormSection } from "./field";

const STATUSES = [
  "Booked",
  "Picked Up",
  "In Transit",
  "At Hub",
  "Customs Hold",
  "Out for Delivery",
  "Delivered",
  "Exception",
];

export function EventFields({
  title,
  value,
  errors,
  onChange,
}: {
  title: string;
  value: EventForm;
  errors: FormErrors<EventForm>;
  onChange: (next: EventForm) => void;
}) {
  const set = (key: keyof EventForm) => (e: { target: { value: string } }) =>
    onChange({ ...value, [key]: e.target.value });
  return (
    <FormSection title={title}>
      <Field
        name="status"
        label="Status"
        value={value.status}
        onChange={set("status")}
        error={errors.status}
        suggestions={STATUSES}
        placeholder="In Transit"
      />
      <Field
        name="location"
        label="Location"
        value={value.location}
        onChange={set("location")}
        error={errors.location}
        placeholder="Kampala Hub, Uganda"
      />
      <Field
        name="carrierName"
        label="Carrier"
        value={value.carrierName}
        onChange={set("carrierName")}
        error={errors.carrierName}
        placeholder={BRAND.carrier.name}
      />
      <Field
        name="scacCode"
        label="Carrier code"
        value={value.scacCode}
        onChange={set("scacCode")}
        error={errors.scacCode}
        placeholder={BRAND.carrier.scacCode}
        maxLength={4}
        autoCapitalize="characters"
        inputClassName="uppercase"
      />
      <Field
        name="timestamp"
        label="Time"
        type="datetime-local"
        step={1}
        value={value.timestamp}
        onChange={set("timestamp")}
        error={errors.timestamp}
        className="sm:col-span-2"
        action={
          <button
            type="button"
            onClick={() => onChange({ ...value, timestamp: toLocalInputValue(new Date()) })}
            className="cursor-pointer rounded-[10px] border border-line bg-surface-2 px-3 text-sm font-semibold text-fg"
          >
            Now
          </button>
        }
      />
    </FormSection>
  );
}
