import { errorResponse } from "@/lib/server/http";
import { getAdminHandlers } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    return await getAdminHandlers().challenge(request);
  } catch (error) {
    return errorResponse(error);
  }
}
