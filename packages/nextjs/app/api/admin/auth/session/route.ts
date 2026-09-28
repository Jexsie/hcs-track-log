import { errorResponse } from "@/lib/server/http";
import { getAdminHandlers } from "@/lib/server/services";

export const dynamic = "force-dynamic";

type Handler = "createSession" | "getSession" | "deleteSession";

async function run(handler: Handler, request: Request): Promise<Response> {
  try {
    return await getAdminHandlers()[handler](request);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Sign in: verify the wallet's signature over the challenge and set the session cookie. */
export const POST = (request: Request) => run("createSession", request);
/** Who is signed in. */
export const GET = (request: Request) => run("getSession", request);
/** Sign out. */
export const DELETE = (request: Request) => run("deleteSession", request);
