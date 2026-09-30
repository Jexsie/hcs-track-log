import { normalizeScacCode } from "@/lib/cargo/event";
import { FieldError } from "@/lib/notary/errors";
import { normalizeDecimal, normalizePositiveInt, normalizeText } from "@/lib/notary/normalize";
import { localInputToUtc } from "./datetime";

/** Raw form state: everything is a string, exactly as typed. */
export interface ParcelForm {
  description: string;
  packageCount: string;
  packageType: string;
  grossMassKg: string;
  volumeCubicMeters: string;
  shipper: string;
  consignee: string;
  bookingRef: string;
}

export interface EventForm {
  status: string;
  location: string;
  carrierName: string;
  scacCode: string;
  /** datetime-local value in the admin's time zone */
  timestamp: string;
}

export const EMPTY_PARCEL_FORM: ParcelForm = {
  description: "",
  packageCount: "",
  packageType: "",
  grossMassKg: "",
  volumeCubicMeters: "",
  shipper: "",
  consignee: "",
  bookingRef: "",
};

export const EMPTY_EVENT_FORM: EventForm = {
  status: "",
  location: "",
  carrierName: "",
  scacCode: "",
  timestamp: "",
};

export type FormErrors<F> = Partial<Record<keyof F, string>>;

function normalizeLocalTimestamp(value: unknown): string {
  const utc = typeof value === "string" ? localInputToUtc(value) : null;

  if (!utc) throw new FieldError("is required: pick a date and time");

  return utc;
}

/* The same primitive normalizers the server runs; these only add per-field error collection. */
const PARCEL_RULES: Record<keyof ParcelForm, (v: unknown) => unknown> = {
  description: normalizeText,
  packageCount: normalizePositiveInt,
  packageType: normalizeText,
  grossMassKg: (v) => normalizeDecimal(v),
  volumeCubicMeters: (v) => normalizeDecimal(v),
  shipper: normalizeText,
  consignee: normalizeText,
  bookingRef: normalizeText,
};

const EVENT_RULES: Record<keyof EventForm, (v: unknown) => unknown> = {
  status: normalizeText,
  location: normalizeText,
  carrierName: normalizeText,
  scacCode: normalizeScacCode,
  timestamp: normalizeLocalTimestamp,
};

/** What admins see: plain language. The shared normalizers above still decide validity. */
const FRIENDLY: Partial<Record<keyof ParcelForm | keyof EventForm, string>> = {
  packageCount: "Enter a whole number, e.g. 12",
  grossMassKg: "Enter a number with up to 2 decimals, e.g. 142.50",
  volumeCubicMeters: "Enter a number with up to 2 decimals, e.g. 0.85",
  scacCode: "Use 2–4 letters, e.g. MAEU",
  timestamp: "Pick a date and time",
};

export function friendlyMessage(field: keyof ParcelForm | keyof EventForm): string {
  return FRIENDLY[field] ?? "Check this field";
}

function validate<F extends object>(
  form: F,
  rules: Record<keyof F, (v: unknown) => unknown>,
): FormErrors<F> {
  const errors: FormErrors<F> = {};

  for (const key of Object.keys(rules) as (keyof F)[]) {
    try {
      rules[key](form[key]);
    } catch (error) {
      if (!(error instanceof FieldError)) throw error;
      const empty = typeof form[key] !== "string" || String(form[key]).trim() === "";
      const field = key as keyof ParcelForm | keyof EventForm;

      errors[key] = empty && field !== "timestamp" ? "Required" : friendlyMessage(field);
    }
  }

  return errors;
}

export const validateParcelForm = (form: ParcelForm) => validate(form, PARCEL_RULES);
export const validateEventForm = (form: EventForm) => validate(form, EVENT_RULES);

/** API body for the parcel. Numbers stay as typed strings so decimals never pass through floats. */
export function toParcelPayload(form: ParcelForm) {
  return {
    consignment: {
      description: form.description,
      packageCount: form.packageCount,
      packageType: form.packageType,
      grossMassKg: form.grossMassKg,
      volumeCubicMeters: form.volumeCubicMeters,
    },
    parties: { shipper: form.shipper, consignee: form.consignee },
    bookingRef: form.bookingRef,
  };
}

export function toEventPayload(form: EventForm) {
  return {
    status: form.status,
    location: form.location,
    carrier: { name: form.carrierName, scacCode: form.scacCode },
    timestamp: localInputToUtc(form.timestamp) ?? form.timestamp,
  };
}

const PATH_TO_FIELD: Record<string, keyof ParcelForm | keyof EventForm> = {
  "consignment.description": "description",
  "consignment.packageCount": "packageCount",
  "consignment.packageType": "packageType",
  "consignment.grossMassKg": "grossMassKg",
  "consignment.volumeCubicMeters": "volumeCubicMeters",
  "parties.shipper": "shipper",
  "parties.consignee": "consignee",
  bookingRef: "bookingRef",
  status: "status",
  location: "location",
  "carrier.name": "carrierName",
  "carrier.scacCode": "scacCode",
  timestamp: "timestamp",
};

/** Map a server ValidationError path (e.g. "carrier.scacCode") to the form field that caused it. */
export function fieldForPath(path: string): keyof ParcelForm | keyof EventForm | null {
  return PATH_TO_FIELD[path] ?? null;
}
