import { errorResponse } from "@/lib/server/http";
import { getWriteHandlers } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** Record a cargo event (HCS-first). Requires `Authorization: Bearer <token>`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ parcelHash: string }> },
): Promise<Response> {
  try {
    const { parcelHash } = await params;
    return await getWriteHandlers().recordEvent(request, parcelHash);
  } catch (error) {
    return errorResponse(error);
  }
}
