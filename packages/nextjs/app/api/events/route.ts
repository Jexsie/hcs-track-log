import { errorResponse } from "@/lib/server/http";
import { getWriteHandlers } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** Record a cargo event (HCS-first). Body: { parcelHash, event }. Requires `Authorization: Bearer <token>`. */
export async function POST(request: Request): Promise<Response> {
  try {
    return await getWriteHandlers().recordEvent(request);
  } catch (error) {
    return errorResponse(error);
  }
}
