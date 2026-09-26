/** Thrown by a primitive normalizer; carries no path. Wrapped into a ValidationError by the caller. */
export class FieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldError";
  }
}

/** A record failed normalization. `path` names the offending field, e.g. "carrier.scacCode". */
export class ValidationError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`${path} ${reason}`);
    this.name = "ValidationError";
  }
}
