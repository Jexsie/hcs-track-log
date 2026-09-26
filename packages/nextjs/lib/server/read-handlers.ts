import { ValidationError } from "@/lib/canonical/errors";
import type { PostgresTrackingReader } from "@/lib/db/tracking-reader";
import { normalizeHashInput } from "@/lib/hashing/sha256";
import { type TimelineDto, toTimelineDto } from "@/lib/timeline/dto";
import { ParcelNotFoundError } from "@/lib/tracking/errors";
import { type Logger, errorResponse, jsonResponse } from "./http";

export type TimelineReader = Pick<PostgresTrackingReader, "findParcel" | "listEvents">;

/** Database-first read. Returns null when there is no such parcel. */
export async function loadTimeline(
  reader: TimelineReader,
  parcelHash: string,
): Promise<TimelineDto | null> {
  const parcel = await reader.findParcel(parcelHash);
  if (!parcel) return null;
  return toTimelineDto(parcel, await reader.listEvents(parcelHash));
}

/** GET /api/parcels/:parcelHash */
export async function getTimelineResponse(
  reader: TimelineReader,
  rawHash: string,
  log?: Logger,
): Promise<Response> {
  try {
    const parcelHash = normalizeHashInput(rawHash);
    if (!parcelHash) throw new ValidationError("parcelHash", "must be a 64-character hex SHA-256");
    const timeline = await loadTimeline(reader, parcelHash);
    if (!timeline) throw new ParcelNotFoundError(parcelHash);
    return jsonResponse(timeline);
  } catch (error) {
    return errorResponse(error, log);
  }
}
