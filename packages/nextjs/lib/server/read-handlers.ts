import { ValidationError } from "@/lib/canonical/errors";
import type { PostgresTrackingReader } from "@/lib/db/tracking-reader";
import { parseTrackingId } from "@/lib/hashing/sha256";
import { type TimelineDto, toTimelineDto } from "@/lib/timeline/dto";
import { ParcelNotFoundError } from "@/lib/tracking/errors";
import { type Logger, errorResponse, jsonResponse, readJsonBody } from "./http";

export type TimelineReader = Pick<PostgresTrackingReader, "findParcel" | "listEvents">;

/** Database-first read by exact tracking ID. Returns null when there is no such parcel. */
export async function loadTimeline(
  reader: TimelineReader,
  parcelHash: string,
): Promise<TimelineDto | null> {
  const parcel = await reader.findParcel(parcelHash);

  if (!parcel) return null;

  return toTimelineDto(parcel, await reader.listEvents(parcelHash));
}

/**
 * POST /api/parcels/lookup  { trackingId }
 *
 * The ID travels in the request body so it never lands in URLs, history, logs or referrers.
 * Anything that is not an exact, existing tracking ID gets the same 404.
 */
export async function lookupTimelineResponse(
  reader: TimelineReader,
  request: Request,
  log?: Logger,
): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    const raw =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as { trackingId?: unknown }).trackingId
        : undefined;

    if (typeof raw !== "string") throw new ValidationError("trackingId", "must be a string");

    const parcelHash = parseTrackingId(raw);
    const timeline = parcelHash ? await loadTimeline(reader, parcelHash) : null;

    if (!timeline) throw new ParcelNotFoundError(raw.trim());

    return jsonResponse(timeline, 200, { "cache-control": "no-store" });
  } catch (error) {
    return errorResponse(error, log);
  }
}
