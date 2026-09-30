import { FieldError, ValidationError } from "./errors";

export type UnknownRecord = Readonly<Record<string, unknown>>;

const join = (parent: string, key: string) => (parent ? `${parent}.${key}` : key);

/**
 * Require a plain object whose keys are all in `allowed`. Unknown keys are rejected so nothing is
 * ever displayed as "verified" that the hash does not commit to. `label` names the object in errors
 * when it is the root (whose `path` is "").
 */
export function readObject(
  value: unknown,
  path: string,
  allowed: readonly string[],
  label: string = path,
): UnknownRecord {
  if (value === undefined || value === null) throw new ValidationError(label, "is required");

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(label, "must be an object");
  }

  const record = value as UnknownRecord;

  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new ValidationError(join(path, key), "is not an allowed field");
    }
  }

  return record;
}

/** Run a primitive normalizer on `record[key]`, attaching the field path to any failure. */
export function readField<T>(
  record: UnknownRecord,
  parent: string,
  key: string,
  normalize: (value: unknown) => T,
): T {
  try {
    return normalize(record[key]);
  } catch (error) {
    if (error instanceof FieldError) throw new ValidationError(join(parent, key), error.message);
    throw error;
  }
}
