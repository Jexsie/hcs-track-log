import { ValidationError } from "@/lib/notary/errors";
import { ConfigError } from "@/lib/server/config/env";
import { ThresholdKeyError } from "@/lib/hedera/threshold-key";
import {
  ParcelExistsError,
  ParcelNotFoundError,
  SubmissionFailedError,
} from "@/lib/approvals/errors";

export type Logger = (message: string, detail?: unknown) => void;

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("body", "must be valid JSON");
  }
}

const bigintAsString = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

export function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data, bigintAsString), {
    status,
    headers: { "content-type": "application/json", ...headers },
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
  if (error instanceof ValidationError) {
    return failure(400, "VALIDATION_ERROR", error.message, { path: error.path });
  }

  if (error instanceof ParcelNotFoundError) {
    return failure(404, "PARCEL_NOT_FOUND", "no parcel with this tracking ID");
  }

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

  log("unhandled error", error);

  return failure(500, "INTERNAL_ERROR", "internal server error");
}

/** Server-side log serialization: bigints as strings, Errors with name, message and cause. */
function serializeForLog(detail: unknown): string {
  return JSON.stringify(detail, (key, value: unknown) => {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, cause: value.cause };
    }

    return bigintAsString(key, value);
  });
}

export const consoleLogger: Logger = (message, detail) =>
  console.error(message, detail === undefined ? "" : serializeForLog(detail));
