import { createHash, timingSafeEqual } from "node:crypto";
import { ValidationError } from "@/lib/canonical/errors";
import { ConfigError } from "@/lib/config/env";
import { ThresholdKeyError } from "@/lib/hedera/threshold-key";
import {
  DerivedWriteError,
  ParcelExistsError,
  ParcelNotFoundError,
  SubmissionFailedError,
} from "@/lib/tracking/errors";

export type Logger = (message: string, detail?: unknown) => void;

export class UnauthorizedError extends Error {
  constructor() {
    super("missing or invalid bearer token");
    this.name = "UnauthorizedError";
  }
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time bearer-token check (digests make the comparison length-independent). */
export function isAuthorized(request: Request, token: string): boolean {
  const match = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
  return match?.[1] !== undefined && timingSafeEqual(digest(match[1]), digest(token));
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("body", "must be valid JSON");
  }
}

const bigintAsString = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, bigintAsString), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const failure = (
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) => jsonResponse({ error: { code, message, ...extra } }, status);

const isMisconfiguration = (error: unknown) =>
  error instanceof ConfigError || error instanceof ThresholdKeyError;

/** Map domain errors to HTTP. Internal details are logged, never returned. */
export function errorResponse(error: unknown, log: Logger = console.error): Response {
  if (error instanceof UnauthorizedError) return failure(401, "UNAUTHORIZED", error.message);
  if (error instanceof ValidationError) {
    return failure(400, "VALIDATION_ERROR", error.message, { path: error.path });
  }
  if (error instanceof ParcelNotFoundError) return failure(404, "PARCEL_NOT_FOUND", error.message);
  if (error instanceof ParcelExistsError) return failure(409, "PARCEL_EXISTS", error.message);
  if (error instanceof SubmissionFailedError) {
    log("HCS submission failed", error.cause);
    return isMisconfiguration(error.cause)
      ? failure(500, "SERVER_MISCONFIGURED", "the server is not configured for ledger submissions")
      : failure(
          502,
          "SUBMISSION_FAILED",
          "the ledger did not accept the event; nothing was recorded",
        );
  }
  if (error instanceof DerivedWriteError) {
    // The event IS on the ledger; its content exists only here. Log everything needed to replay it.
    log("anchored event could not be cached; replay this insert", {
      pending: error.pending,
      parcel: error.parcel,
      cause: error.cause,
    });
    return failure(500, "CACHE_WRITE_FAILED", "the event was anchored but could not be cached", {
      hcsSequenceNumber: error.hcsSequenceNumber,
    });
  }
  log("unhandled error", error);
  return failure(500, "INTERNAL_ERROR", "internal server error");
}

/** Server-side log serialization: bigints as strings, Errors with name, message and cause. */
export function serializeForLog(detail: unknown): string {
  return JSON.stringify(detail, (key, value: unknown) => {
    if (value instanceof Error)
      return { name: value.name, message: value.message, cause: value.cause };
    return bigintAsString(key, value);
  });
}

export const consoleLogger: Logger = (message, detail) =>
  console.error(message, detail === undefined ? "" : serializeForLog(detail));
