import { consoleLogger, errorResponse } from "@/lib/server/http";
import { lookupTimelineResponse } from "@/lib/server/read-handlers";
import { getReader } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** Database-first timeline read by exact tracking ID, sent in the body (never the URL). */
export async function POST(request: Request): Promise<Response> {
  try {
    return await lookupTimelineResponse(getReader(), request, consoleLogger);
  } catch (error) {
    return errorResponse(error, consoleLogger);
  }
}
