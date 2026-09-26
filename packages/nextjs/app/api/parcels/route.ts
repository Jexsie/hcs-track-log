import { errorResponse } from "@/lib/server/http";
import { getWriteHandlers } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** Register a parcel with its first event (HCS-first). Requires `Authorization: Bearer <token>`. */
export async function POST(request: Request): Promise<Response> {
  try {
    return await getWriteHandlers().registerParcel(request);
  } catch (error) {
    return errorResponse(error);
  }
}
