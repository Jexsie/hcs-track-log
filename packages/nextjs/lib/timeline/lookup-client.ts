import type { TimelineDto } from "./dto";

export type LookupResult =
  | { status: "found"; timeline: TimelineDto }
  | { status: "not-found" }
  | { status: "error"; message: string };

// Wrapped rather than referenced: an unbound `window.fetch` throws "Illegal invocation".
const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

/** Look a parcel up by exact tracking ID. The ID goes in the POST body, never in a URL. */
export async function lookupTimeline(
  trackingId: string,
  fetchImpl: typeof fetch = defaultFetch,
): Promise<LookupResult> {
  let response: Response;

  try {
    response = await fetchImpl("/api/parcels/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackingId }),
      cache: "no-store",
    });
  } catch {
    return { status: "error", message: "Could not reach the server." };
  }

  if (response.status === 404) return { status: "not-found" };
  if (!response.ok) return { status: "error", message: `Lookup failed (${response.status}).` };

  try {
    return { status: "found", timeline: (await response.json()) as TimelineDto };
  } catch {
    return { status: "error", message: "The server returned an unexpected response." };
  }
}
