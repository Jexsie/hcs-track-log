import { consoleLogger, errorResponse } from "@/lib/server/http";
import { getTimelineResponse } from "@/lib/server/read-handlers";
import { getReader } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** Database-first timeline read. Returns stored content only; clients verify by recomputation. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ parcelHash: string }> },
): Promise<Response> {
  try {
    const { parcelHash } = await params;
    return await getTimelineResponse(getReader(), parcelHash, consoleLogger);
  } catch (error) {
    return errorResponse(error, consoleLogger);
  }
}
