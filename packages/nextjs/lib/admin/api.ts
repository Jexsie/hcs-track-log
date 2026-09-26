/** Browser client for the write API, used by the admin console. */

import { lookupTimeline } from "@/lib/timeline/lookup-client";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; path?: string };

export interface RegisterParcelResponse {
  parcelHash: string;
  firstEvent: { hcsSequenceNumber: string; payerAccountId: string };
}

export interface RecordEventResponse {
  parcelHash: string;
  hcsSequenceNumber: string;
}

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
    response = await fetchImpl(url, init);
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

const post = (token: string, body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

export function registerParcel(
  token: string,
  body: { parcel: unknown; firstEvent: unknown } | Record<string, never>,
  fetchImpl: typeof fetch = defaultFetch,
): Promise<ApiResult<RegisterParcelResponse>> {
  return call("/api/parcels", post(token, body), fetchImpl);
}

export function recordEvent(
  token: string,
  parcelHash: string,
  event: unknown,
  fetchImpl: typeof fetch = defaultFetch,
): Promise<ApiResult<RecordEventResponse>> {
  return call("/api/events", post(token, { parcelHash, event }), fetchImpl);
}

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
