import { errorResponse } from "@/lib/server/http";
import { getAdminHandlers } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** Open submissions awaiting wallet approval. */
export async function GET(request: Request): Promise<Response> {
  try {
    return await getAdminHandlers().listSubmissions(request);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Propose a registration or event: scheduled on-chain, staged until approved. */
export async function POST(request: Request): Promise<Response> {
  try {
    return await getAdminHandlers().propose(request);
  } catch (error) {
    return errorResponse(error);
  }
}
