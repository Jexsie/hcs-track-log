import { PrivateKey } from "@hiero-ledger/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import type { NewSubmission, PendingStore, PendingSubmission } from "@/lib/approvals/ports";
import { MirrorRequestError } from "@/lib/mirror/http";
import { FakeLedger } from "@/test/fake-ledger";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { walletSign } from "@/test/wallet-signing";
import { SESSION_COOKIE, createAdminHandlers } from "./admin-handlers";

const SECRET = "k".repeat(40);
const [alice, mallory] = [PrivateKey.generateED25519(), PrivateKey.generateED25519()] as const;
const keys: Record<string, PrivateKey> = { "0.0.100": alice, "0.0.666": mallory };
const { createdAt: _c, ...parcelForm } = referenceParcel;

class MemoryPending implements PendingStore {
  readonly rows: PendingSubmission[] = [];
  async insert(s: NewSubmission) {
    const row: PendingSubmission = {
      ...s,
      proposedAt: new Date(),
      status: "pending",
      statusReason: null,
      hcsSequenceNumber: null,
    };
    this.rows.push(row);
    return row;
  }
  async get(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async listOpen() {
    return this.rows.filter((r) => r.status === "pending");
  }
  async hasOpenRegistration() {
    return false;
  }
  async complete() {}
  async close() {}
}

let pending: MemoryPending;
let ledger: FakeLedger;
function handlers(overrides: Partial<Parameters<typeof createAdminHandlers>[0]> = {}) {
  return createAdminHandlers({
    secret: () => SECRET,
    now: () => new Date(),
    secureCookies: true,
    submitKeys: async () => [alice.publicKey],
    resolveAccountKey: async (id) => {
      const key = keys[id];
      if (!key) throw new Error("unknown");
      return key.publicKey;
    },
    scheduler: async () => ledger,
    pending: () => pending,
    cache: () => ({ parcelExists: async () => false }),
    finalizeDeps: () => {
      throw new Error("not used here");
    },
    log: () => {},
    ...overrides,
  });
}

const json = (url: string, body: unknown, cookie?: string, method = "POST") =>
  new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });

async function signIn(accountId: string): Promise<Response> {
  const h = handlers();
  const challenge = (await (
    await h.challenge(json("/api/admin/auth/challenge", { accountId }))
  ).json()) as { message: string; token: string };
  const key = keys[accountId];
  if (!key) throw new Error("no key");
  return h.createSession(
    json("/api/admin/auth/session", {
      accountId,
      token: challenge.token,
      signatureMap: await walletSign(key, challenge.message),
    }),
  );
}

const cookieFrom = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

beforeEach(() => {
  pending = new MemoryPending();
  ledger = new FakeLedger();
});

describe("wallet sign-in", () => {
  it("issues a challenge naming the account and this origin", async () => {
    const res = await handlers().challenge(
      json("/api/admin/auth/challenge", { accountId: "0.0.100" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("Account: 0.0.100");
    expect(body.message).toContain("Domain: localhost:3000");
  });

  it("sets an HttpOnly, SameSite=Strict, Secure session cookie for a submit-key holder", async () => {
    const res = await signIn("0.0.100");
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    for (const attr of ["HttpOnly", "SameSite=Strict", "Secure", "Path=/"])
      expect(cookie).toContain(attr);
    const me = await handlers().getSession(
      json("/api/admin/auth/session", null, cookieFrom(res), "GET"),
    );
    expect(await me.json()).toEqual({ accountId: "0.0.100" });
  });

  it("returns 403 for a valid wallet that is not a submitter, 401 for bad input", async () => {
    expect((await signIn("0.0.666")).status).toBe(403);
    const res = await handlers().createSession(
      json("/api/admin/auth/session", { accountId: "0.0.100", token: "x", signatureMap: "y" }),
    );
    expect(res.status).toBe(401);
    expect(
      (await handlers().getSession(json("/api/admin/auth/session", null, undefined, "GET"))).status,
    ).toBe(401);
  });

  it("logs out by expiring the cookie", async () => {
    const res = await handlers().deleteSession(
      json("/api/admin/auth/session", null, cookieFrom(await signIn("0.0.100")), "DELETE"),
    );
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("ledger outages", () => {
  it("answers 503 LEDGER_UNAVAILABLE when the mirror node is unreachable during sign-in", async () => {
    const h = handlers({
      submitKeys: () => Promise.reject(new MirrorRequestError("mirror node is unreachable")),
    });
    const challenge = (await (
      await h.challenge(json("/api/admin/auth/challenge", { accountId: "0.0.100" }))
    ).json()) as { message: string; token: string };
    const res = await h.createSession(
      json("/api/admin/auth/session", {
        accountId: "0.0.100",
        token: challenge.token,
        signatureMap: await walletSign(alice, challenge.message),
      }),
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "LEDGER_UNAVAILABLE",
    );
  });
});

describe("submissions API", () => {
  it("requires a session for listing, proposing and finalizing", async () => {
    const h = handlers();
    expect(
      (await h.listSubmissions(json("/api/admin/submissions", null, undefined, "GET"))).status,
    ).toBe(401);
    expect(
      (await h.propose(json("/api/admin/submissions", { kind: "register-parcel" }))).status,
    ).toBe(401);
    expect((await h.finalize(json("/api/admin/submissions/finalize", { id: "x" }))).status).toBe(
      401,
    );
    expect(ledger.schedules.size).toBe(0);
  });

  it("rejects state-changing requests that are not JSON (CSRF guard)", async () => {
    const cookie = cookieFrom(await signIn("0.0.100"));
    const form = new Request("http://localhost:3000/api/admin/submissions", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: "kind=register-parcel",
    });
    expect((await handlers().propose(form)).status).toBe(415);
  });

  it("proposes a registration as the signed-in admin and lists it with its content", async () => {
    const cookie = cookieFrom(await signIn("0.0.100"));
    const res = await handlers().propose(
      json(
        "/api/admin/submissions",
        { kind: "register-parcel", parcel: parcelForm, firstEvent: referenceEvent },
        cookie,
      ),
    );
    expect(res.status).toBe(201);
    const { submission } = (await res.json()) as {
      submission: {
        id: string;
        scheduleId: string;
        proposedBy: string;
        parcel: { createdAt: string };
      };
    };
    expect(submission.proposedBy).toBe("0.0.100");
    expect(submission.parcel.createdAt).toMatch(/Z$/);
    expect(ledger.schedules.has(submission.scheduleId)).toBe(true);

    const list = (await (
      await handlers().listSubmissions(json("/api/admin/submissions", null, cookie, "GET"))
    ).json()) as { submissions: { id: string }[] };
    expect(list.submissions.map((s) => s.id)).toEqual([submission.id]);
  });

  it("rejects an unknown submission kind", async () => {
    const cookie = cookieFrom(await signIn("0.0.100"));
    expect(
      (
        await handlers().propose(
          json("/api/admin/submissions", { kind: "delete-everything" }, cookie),
        )
      ).status,
    ).toBe(400);
  });
});
