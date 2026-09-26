import { describe, expect, it } from "vitest";
import { ConfigError } from "@/lib/config/env";
import { ValidationError } from "@/lib/canonical/errors";
import { ThresholdKeyError } from "@/lib/hedera/threshold-key";
import {
  DerivedWriteError,
  ParcelExistsError,
  ParcelNotFoundError,
  SubmissionFailedError,
} from "@/lib/tracking/errors";
import { recordedEvent } from "@/test/fixtures/parcels";
import {
  UnauthorizedError,
  errorResponse,
  isAuthorized,
  jsonResponse,
  readJsonBody,
  serializeForLog,
} from "./http";

const TOKEN = "t".repeat(40);
const req = (headers: Record<string, string> = {}, body?: string) =>
  new Request("http://localhost/api/parcels", { method: "POST", headers, body });

describe("isAuthorized", () => {
  it("accepts the exact bearer token", () => {
    expect(isAuthorized(req({ authorization: `Bearer ${TOKEN}` }), TOKEN)).toBe(true);
  });

  it.each([
    ["no header", {}],
    ["wrong token", { authorization: `Bearer ${"x".repeat(40)}` }],
    ["prefix of the token", { authorization: `Bearer ${TOKEN.slice(0, 10)}` }],
    ["wrong scheme", { authorization: `Basic ${TOKEN}` }],
  ])("rejects %s", (_label, headers) => {
    expect(isAuthorized(req(headers), TOKEN)).toBe(false);
  });
});

describe("readJsonBody", () => {
  it("parses JSON and rejects malformed bodies", async () => {
    expect(await readJsonBody(req({}, '{"a":1}'))).toEqual({ a: 1 });
    await expect(readJsonBody(req({}, "{oops"))).rejects.toThrow(ValidationError);
  });
});

describe("jsonResponse", () => {
  it("serializes bigint sequence numbers as strings", async () => {
    const res = jsonResponse({ seq: 9007199254740993n }, 201);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('{"seq":"9007199254740993"}');
  });
});

describe("errorResponse", () => {
  const body = async (res: Response) => (await res.json()) as { error: Record<string, unknown> };
  const quiet = () => {};

  it.each([
    [new UnauthorizedError(), 401, "UNAUTHORIZED"],
    [new ValidationError("carrier.scacCode", "must be 2–4 letters"), 400, "VALIDATION_ERROR"],
    [new ParcelNotFoundError("a".repeat(64)), 404, "PARCEL_NOT_FOUND"],
    [new ParcelExistsError("a".repeat(64)), 409, "PARCEL_EXISTS"],
    [new SubmissionFailedError(new Error("BUSY")), 502, "SUBMISSION_FAILED"],
    [
      new SubmissionFailedError(new ConfigError("HCS_TOPIC_ID is not set")),
      500,
      "SERVER_MISCONFIGURED",
    ],
    [new SubmissionFailedError(new ThresholdKeyError("mismatch")), 500, "SERVER_MISCONFIGURED"],
    [new Error("boom"), 500, "INTERNAL_ERROR"],
  ])("maps %s to %i", async (error, status, code) => {
    const res = errorResponse(error, quiet);
    expect(res.status).toBe(status);
    expect((await body(res)).error.code).toBe(code);
  });

  it("includes the field path for validation errors", async () => {
    const res = errorResponse(
      new ValidationError("carrier.scacCode", "must be 2–4 letters"),
      quiet,
    );
    expect((await body(res)).error).toMatchObject({
      path: "carrier.scacCode",
      message: "carrier.scacCode must be 2–4 letters",
    });
  });

  it("does not leak internal error details", async () => {
    const res = errorResponse(
      new SubmissionFailedError(new ConfigError("HEDERA_OPERATOR_KEY is not valid")),
      quiet,
    );
    expect(JSON.stringify(await body(res))).not.toContain("HEDERA_OPERATOR_KEY");
  });

  it("logs the full pending event for an anchored-but-not-cached write, and returns its sequence number", async () => {
    const logged: unknown[] = [];
    const pending = recordedEvent("b".repeat(64), 42n);
    const res = errorResponse(
      new DerivedWriteError(pending, null, new Error("db down")),
      (...args) => logged.push(args),
    );
    expect(res.status).toBe(500);
    expect((await body(res)).error).toMatchObject({
      code: "CACHE_WRITE_FAILED",
      hcsSequenceNumber: "42",
    });
    const serialized = JSON.stringify(logged, (_k, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    expect(serialized).toContain("Kampala Hub, Uganda");
  });
});

describe("serializeForLog", () => {
  it("keeps error messages, causes and bigints", () => {
    const error = new SubmissionFailedError(new ConfigError("HCS_TOPIC_ID is not set"));
    const out = serializeForLog({ error, seq: 5n });
    expect(out).toContain("HCS_TOPIC_ID is not set");
    expect(out).toContain('"seq":"5"');
  });
});
