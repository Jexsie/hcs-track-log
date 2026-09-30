import type { PublicKey } from "@hiero-ledger/sdk";
import { ValidationError } from "@/lib/notary/errors";
import {
  type FinalizeDeps,
  SubmissionNotFoundError,
  finalizeSubmission,
} from "@/lib/approvals/finalize";
import type {
  EnvelopeScheduler,
  ParcelCache,
  PendingStore,
  PendingSubmission,
} from "@/lib/approvals/ports";
import { proposeEvent, proposeRegistration } from "@/lib/approvals/propose";
import { signInWithWallet } from "@/lib/server/auth/sign-in";
import {
  type AdminIdentity,
  AuthError,
  SESSION_MAX_AGE_SECONDS,
  issueChallenge,
  issueSessionToken,
  readSessionToken,
} from "@/lib/server/auth/tokens";
import { MirrorNotFoundError, MirrorRequestError } from "@/lib/hedera/mirror/http";
import { type Logger, errorResponse, jsonResponse, readJsonBody } from "./http";

const SESSION_COOKIE = "hcs_admin_session";
const ACCOUNT_ID = /^\d+\.\d+\.\d+$/;

export interface AdminHandlerDeps {
  secret: () => string;
  now: () => Date;
  /** Send cookies with `Secure` (true outside local development). */
  secureCookies: boolean;
  /** Members of the topic's submit key, as currently on-chain. */
  submitKeys: () => Promise<PublicKey[]>;
  resolveAccountKey: (accountId: string) => Promise<PublicKey>;
  scheduler: () => Promise<EnvelopeScheduler>;
  pending: () => PendingStore;
  cache: () => ParcelCache;
  finalizeDeps: () => FinalizeDeps;
  log?: Logger;
}

class UnsupportedMediaError extends Error {}

/** JSON-only bodies: a cross-site HTML form cannot send application/json without a CORS preflight. */
async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new UnsupportedMediaError();
  }

  const body = await readJsonBody(request);

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("body", "must be a JSON object");
  }

  return body as Record<string, unknown>;
}

function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");

    if (key === name) return value.join("=");
  }

  return undefined;
}

function cookie(value: string, maxAge: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function toSubmissionDto(s: PendingSubmission) {
  return {
    id: s.id,
    kind: s.kind,
    parcelHash: s.parcelHash,
    parcel: s.parcel,
    event: s.event,
    scheduleId: s.scheduleId,
    expiresAt: s.expiresAt.toISOString(),
    proposedBy: s.proposedBy,
    proposedAt: s.proposedAt.toISOString(),
    status: s.status,
    statusReason: s.statusReason,
    hcsSequenceNumber: s.hcsSequenceNumber,
  };
}

export function createAdminHandlers(deps: AdminHandlerDeps) {
  function fail(error: unknown): Response {
    if (error instanceof UnsupportedMediaError) {
      return jsonResponse(
        { error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "send application/json" } },
        415,
      );
    }

    if (error instanceof AuthError) {
      const status = error.code === "NOT_A_SUBMITTER" ? 403 : 401;

      return jsonResponse({ error: { code: error.code, message: error.message } }, status);
    }

    if (error instanceof MirrorRequestError || error instanceof MirrorNotFoundError) {
      deps.log?.("mirror node unavailable", error);

      return jsonResponse(
        {
          error: {
            code: "LEDGER_UNAVAILABLE",
            message: "the ledger mirror node is unavailable; retry shortly",
          },
        },
        503,
      );
    }

    if (error instanceof SubmissionNotFoundError) {
      return jsonResponse({ error: { code: "SUBMISSION_NOT_FOUND", message: error.message } }, 404);
    }

    return errorResponse(error, deps.log);
  }

  function requireAdmin(request: Request): AdminIdentity {
    const identity = readSessionToken(
      readCookie(request, SESSION_COOKIE),
      deps.secret(),
      deps.now(),
    );

    if (!identity) throw new AuthError("UNAUTHENTICATED", "sign in with an administrator wallet");

    return identity;
  }

  const handle =
    (run: (request: Request) => Promise<Response>) =>
    async (request: Request): Promise<Response> => {
      try {
        return await run(request);
      } catch (error) {
        return fail(error);
      }
    };

  return {
    /** POST /api/admin/auth/challenge { accountId } */
    challenge: handle(async (request) => {
      const { accountId } = await readJson(request);

      if (typeof accountId !== "string" || !ACCOUNT_ID.test(accountId)) {
        throw new ValidationError("accountId", "must look like 0.0.12345");
      }

      const domain = new URL(request.url).host;

      return jsonResponse(
        issueChallenge({ accountId, domain, secret: deps.secret(), now: deps.now() }),
        200,
        {
          "cache-control": "no-store",
        },
      );
    }),

    /** POST /api/admin/auth/session { accountId, token, signatureMap } */
    createSession: handle(async (request) => {
      const { accountId, token, signatureMap } = await readJson(request);

      if (
        typeof accountId !== "string" ||
        typeof token !== "string" ||
        typeof signatureMap !== "string"
      ) {
        throw new AuthError("BAD_CHALLENGE", "accountId, token and signatureMap are required");
      }

      const identity = await signInWithWallet(
        { accountId, token, signatureMap },
        {
          secret: deps.secret(),
          now: deps.now,
          submitKeys: await deps.submitKeys(),
          resolveAccountKey: deps.resolveAccountKey,
        },
      );
      const session = issueSessionToken(identity, deps.secret(), deps.now());

      return jsonResponse({ accountId: identity.accountId }, 200, {
        "set-cookie": cookie(session, SESSION_MAX_AGE_SECONDS, deps.secureCookies),
      });
    }),

    /** GET /api/admin/auth/session */
    getSession: handle(async (request) =>
      jsonResponse({ accountId: requireAdmin(request).accountId }),
    ),

    /** DELETE /api/admin/auth/session */
    deleteSession: handle(async () =>
      jsonResponse({ signedOut: true }, 200, { "set-cookie": cookie("", 0, deps.secureCookies) }),
    ),

    /** GET /api/admin/submissions: open submissions awaiting wallet approval. */
    listSubmissions: handle(async (request) => {
      requireAdmin(request);
      const open = await deps.pending().listOpen();

      return jsonResponse({ submissions: open.map(toSubmissionDto) }, 200, {
        "cache-control": "no-store",
      });
    }),

    /** POST /api/admin/submissions { kind: "register-parcel", parcel, firstEvent } | { kind: "record-event", parcelHash, event } */
    propose: handle(async (request) => {
      const admin = requireAdmin(request);
      const body = await readJson(request);
      const proposeDeps = {
        scheduler: await deps.scheduler(),
        pending: deps.pending(),
        cache: deps.cache(),
        proposedBy: admin.accountId,
        now: deps.now,
      };
      let submission: PendingSubmission;

      if (body.kind === "register-parcel") {
        submission = await proposeRegistration(
          { parcel: body.parcel, firstEvent: body.firstEvent },
          proposeDeps,
        );
      } else if (body.kind === "record-event") {
        submission = await proposeEvent(
          { parcelHash: body.parcelHash, event: body.event },
          proposeDeps,
        );
      } else {
        throw new ValidationError("kind", 'must be "register-parcel" or "record-event"');
      }

      return jsonResponse({ submission: toSubmissionDto(submission) }, 201);
    }),

    /** POST /api/admin/submissions/finalize { id } */
    finalize: handle(async (request) => {
      requireAdmin(request);
      const { id } = await readJson(request);

      if (typeof id !== "string") throw new ValidationError("id", "must be a string");

      return jsonResponse(await finalizeSubmission(id, deps.finalizeDeps()), 200, {
        "cache-control": "no-store",
      });
    }),
  };
}
