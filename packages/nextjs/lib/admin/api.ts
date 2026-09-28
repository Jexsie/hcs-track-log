/**
 * Browser client for the administrator API. Authentication is the HttpOnly session cookie set by
 * wallet sign-in; every body is JSON and no identifier ever goes into a URL.
 */

import type { FinalizeResultDto, SubmissionDto } from "@/lib/approvals/dto";
import { lookupTimeline } from "@/lib/timeline/lookup-client";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; path?: string };

export type ApiFailure = Extract<ApiResult<unknown>, { ok: false }>;

export interface ParcelSummary {
  description: string;
  eventCount: number;
  latest: { status: string; location: string; hcsSequenceNumber: string } | null;
}

// Wrapped rather than referenced: an unbound `window.fetch` throws "Illegal invocation".
const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

async function call<T>(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(url, { credentials: "same-origin", cache: "no-store", ...init });
  } catch {
    return { ok: false, status: 0, code: "NETWORK_ERROR", message: "Could not reach the server." };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      status: response.status,
      code: "BAD_RESPONSE",
      message: `Unexpected response (${response.status}).`,
    };
  }
  if (response.ok) return { ok: true, data: body as T };
  const error =
    (body as { error?: { code?: unknown; message?: unknown; path?: unknown } }).error ?? {};
  return {
    ok: false,
    status: response.status,
    code: typeof error.code === "string" ? error.code : "UNKNOWN_ERROR",
    message:
      typeof error.message === "string" ? error.message : `Request failed (${response.status}).`,
    ...(typeof error.path === "string" ? { path: error.path } : {}),
  };
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const requestChallenge = (accountId: string, f: typeof fetch = defaultFetch) =>
  call<{ message: string; token: string }>("/api/admin/auth/challenge", postJson({ accountId }), f);

export const createSession = (
  body: { accountId: string; token: string; signatureMap: string },
  f: typeof fetch = defaultFetch,
) => call<{ accountId: string }>("/api/admin/auth/session", postJson(body), f);

export const getSession = (f: typeof fetch = defaultFetch) =>
  call<{ accountId: string }>("/api/admin/auth/session", { method: "GET" }, f);

export const signOut = (f: typeof fetch = defaultFetch) =>
  call<{ signedOut: true }>("/api/admin/auth/session", { method: "DELETE" }, f);

export const listSubmissions = (f: typeof fetch = defaultFetch) =>
  call<{ submissions: SubmissionDto[] }>("/api/admin/submissions", { method: "GET" }, f);

export const proposeRegistration = (
  body: { parcel: unknown; firstEvent: unknown },
  f: typeof fetch = defaultFetch,
) =>
  call<{ submission: SubmissionDto }>(
    "/api/admin/submissions",
    postJson({ kind: "register-parcel", ...body }),
    f,
  );

export const proposeEvent = (
  body: { parcelHash: string; event: unknown },
  f: typeof fetch = defaultFetch,
) =>
  call<{ submission: SubmissionDto }>(
    "/api/admin/submissions",
    postJson({ kind: "record-event", ...body }),
    f,
  );

export const finalizeSubmission = (id: string, f: typeof fetch = defaultFetch) =>
  call<FinalizeResultDto>("/api/admin/submissions/finalize", postJson({ id }), f);

/** Look a parcel up before recording an event, so admins can confirm they have the right one. */
export async function fetchParcelSummary(
  parcelHash: string,
  fetchImpl: typeof fetch = defaultFetch,
): Promise<ApiResult<ParcelSummary>> {
  const result = await lookupTimeline(parcelHash, fetchImpl);
  if (result.status === "not-found") {
    return {
      ok: false,
      status: 404,
      code: "PARCEL_NOT_FOUND",
      message: "No parcel has exactly this tracking ID.",
    };
  }
  if (result.status === "error")
    return { ok: false, status: 0, code: "LOOKUP_FAILED", message: result.message };
  const { parcel, events } = result.timeline;
  const last = events.at(-1);
  return {
    ok: true,
    data: {
      description: parcel.consignment.description,
      eventCount: events.length,
      latest: last
        ? {
            status: last.content.status,
            location: last.content.location,
            hcsSequenceNumber: last.hcsSequenceNumber,
          }
        : null,
    },
  };
}
