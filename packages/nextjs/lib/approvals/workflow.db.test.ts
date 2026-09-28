import { PrivateKey } from "@hiero-ledger/sdk";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/canonical/errors";
import { PendingSubmissionStore } from "@/lib/db/pending-store";
import { PostgresTrackingReader } from "@/lib/db/tracking-reader";
import { PostgresTrackingStore } from "@/lib/db/tracking-store";
import { buildEnvelope, serializeEnvelope } from "@/lib/envelope/envelope";
import { computePayloadHash } from "@/lib/hashing/payload-hash";
import { fetchSchedule } from "@/lib/mirror/ledger-state";
import { createMirrorClient } from "@/lib/mirror/mirror-client";
import {
  ParcelExistsError,
  ParcelNotFoundError,
  SubmissionFailedError,
} from "@/lib/tracking/errors";
import { verifyTimeline } from "@/lib/verify/verify-timeline";
import { createTestPool, truncateAll } from "@/test/db/database";
import { FAKE_MIRROR, FAKE_TOPIC, FakeLedger } from "@/test/fake-ledger";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { finalizeSubmission } from "./finalize";
import { proposeEvent, proposeRegistration } from "./propose";

const pool = createTestPool();
const cache = new PostgresTrackingStore(pool);
const reader = new PostgresTrackingReader(pool);
const pending = new PendingSubmissionStore(pool);
afterAll(() => pool.end());

const { createdAt: _serverAssigned, ...parcelForm } = referenceParcel;
const [alice, bob, carol] = [0, 1, 2].map(() =>
  PrivateKey.generateED25519().publicKey.toStringRaw(),
);
let ledger: FakeLedger;

const proposeDeps = () => ({ scheduler: ledger, pending, cache, proposedBy: "0.0.100" });
const finalizeDeps = () => ({
  pending,
  topicId: FAKE_TOPIC,
  readSchedule: (id: string) => fetchSchedule(FAKE_MIRROR, id, ledger.fetch),
  messages: createMirrorClient({ baseUrl: FAKE_MIRROR, topicId: FAKE_TOPIC, fetch: ledger.fetch }),
});
const count = async (table: string) =>
  Number((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n);

beforeEach(async () => {
  await truncateAll(pool);
  await pool.query("TRUNCATE pending_submissions");
  ledger = new FakeLedger();
  ledger.submitKeys = [alice ?? "", bob ?? "", carol ?? ""];
  ledger.threshold = 2;
});

describe("propose → approve in wallets → finalize", () => {
  it("schedules only the blind envelope and caches nothing until the network executes it", async () => {
    const submission = await proposeRegistration(
      { parcel: parcelForm, firstEvent: referenceEvent },
      proposeDeps(),
    );

    const scheduled = ledger.schedules.get(submission.scheduleId);
    expect(scheduled).toBeDefined();
    const expected = serializeEnvelope(
      buildEnvelope({
        parcelHash: submission.parcelHash,
        payloadHash: await computePayloadHash(referenceEvent),
      }),
    );
    expect(scheduled?.message).toEqual(expected);
    expect(scheduled?.memo).toBe(`hcs-track-log approval ${submission.id}`); // no business data on-chain
    expect(ledger.entries).toHaveLength(0);
    expect(await count("parcels")).toBe(0);
    expect(await count("cargo_events")).toBe(0);

    expect(await finalizeSubmission(submission.id, finalizeDeps())).toMatchObject({
      status: "pending",
      approvals: 0,
    });
    await ledger.approve(submission.scheduleId, alice ?? "");
    expect(await finalizeSubmission(submission.id, finalizeDeps())).toMatchObject({
      status: "pending",
      approvals: 1,
    });
    expect(await count("parcels")).toBe(0);
  });

  it("caches the parcel and event once the threshold is reached, and the cache verifies against the ledger", async () => {
    const submission = await proposeRegistration(
      { parcel: parcelForm, firstEvent: referenceEvent },
      proposeDeps(),
    );
    await ledger.approve(submission.scheduleId, alice ?? "");
    await ledger.approve(submission.scheduleId, bob ?? "");

    expect(await finalizeSubmission(submission.id, finalizeDeps())).toMatchObject({
      status: "executed",
      hcsSequenceNumber: 1n,
    });
    expect(await finalizeSubmission(submission.id, finalizeDeps())).toMatchObject({
      status: "executed",
      hcsSequenceNumber: 1n,
    });
    expect(await count("cargo_events")).toBe(1);

    const parcel = await reader.findParcel(submission.parcelHash);
    const events = await reader.listEvents(submission.parcelHash);
    const report = await verifyTimeline({
      parcelHash: submission.parcelHash,
      parcel: parcel?.content,
      events,
      mirror: createMirrorClient({
        baseUrl: FAKE_MIRROR,
        topicId: FAKE_TOPIC,
        fetch: ledger.fetch,
      }),
    });
    expect(report.parcel.status).toBe("verified");
    expect(report.summary).toEqual({ verified: 1, tampered: 0, unavailable: 0 });
  });

  it("records a follow-up event for an existing parcel", async () => {
    const reg = await proposeRegistration(
      { parcel: parcelForm, firstEvent: referenceEvent },
      proposeDeps(),
    );
    await ledger.approve(reg.scheduleId, alice ?? "");
    await ledger.approve(reg.scheduleId, carol ?? "");
    await finalizeSubmission(reg.id, finalizeDeps());

    const next = await proposeEvent(
      { parcelHash: reg.parcelHash, event: { ...referenceEvent, status: "Delivered" } },
      proposeDeps(),
    );
    await ledger.approve(next.scheduleId, bob ?? "");
    await ledger.approve(next.scheduleId, carol ?? "");
    expect(await finalizeSubmission(next.id, finalizeDeps())).toMatchObject({
      status: "executed",
      hcsSequenceNumber: 2n,
    });
    expect((await reader.listEvents(reg.parcelHash)).map((e) => e.content.status)).toEqual([
      "In Transit",
      "Delivered",
    ]);
  });

  it("rejects, and never caches, staged content that no longer matches the scheduled message", async () => {
    const submission = await proposeRegistration(
      { parcel: parcelForm, firstEvent: referenceEvent },
      proposeDeps(),
    );
    await pool.query(
      `UPDATE pending_submissions SET event_content = jsonb_set(event_content, '{location}', '"Nairobi Depot, Kenya"') WHERE id = $1`,
      [submission.id],
    );
    await ledger.approve(submission.scheduleId, alice ?? "");
    await ledger.approve(submission.scheduleId, bob ?? "");

    expect(await finalizeSubmission(submission.id, finalizeDeps())).toMatchObject({
      status: "rejected",
    });
    expect(await count("parcels")).toBe(0);
    expect(await count("cargo_events")).toBe(0);
    expect((await pending.listOpen()).map((s) => s.id)).not.toContain(submission.id);
  });

  it("expires a submission whose approval window passed without enough approvals", async () => {
    const submission = await proposeRegistration(
      { parcel: parcelForm, firstEvent: referenceEvent },
      proposeDeps(),
    );
    await pool.query(
      "UPDATE pending_submissions SET expires_at = now() - interval '1 minute' WHERE id = $1",
      [submission.id],
    );
    expect(await finalizeSubmission(submission.id, finalizeDeps())).toMatchObject({
      status: "expired",
    });
  });
});

describe("proposal guards (nothing is scheduled)", () => {
  it("validates content before scheduling", async () => {
    await expect(
      proposeRegistration(
        { parcel: parcelForm, firstEvent: { ...referenceEvent, status: "" } },
        proposeDeps(),
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      proposeEvent({ parcelHash: "nope", event: referenceEvent }, proposeDeps()),
    ).rejects.toThrow(ValidationError);
    expect(ledger.schedules.size).toBe(0);
  });

  it("refuses unknown parcels and duplicate registrations (cached or still awaiting approval)", async () => {
    await expect(
      proposeEvent({ parcelHash: "a".repeat(64), event: referenceEvent }, proposeDeps()),
    ).rejects.toThrow(ParcelNotFoundError);
    const now = () => new Date("2026-09-28T10:00:00Z");
    await proposeRegistration(
      { parcel: parcelForm, firstEvent: referenceEvent },
      { ...proposeDeps(), now },
    );
    await expect(
      proposeRegistration(
        { parcel: parcelForm, firstEvent: referenceEvent },
        { ...proposeDeps(), now },
      ),
    ).rejects.toThrow(ParcelExistsError);
    expect(ledger.schedules.size).toBe(1);
  });

  it("stores nothing when the ledger refuses to create the schedule", async () => {
    ledger.failNextSchedule = new Error("INSUFFICIENT_PAYER_BALANCE");
    await expect(
      proposeRegistration({ parcel: parcelForm, firstEvent: referenceEvent }, proposeDeps()),
    ).rejects.toThrow(SubmissionFailedError);
    expect(await count("pending_submissions")).toBe(0);
  });

  it("lists only open submissions", async () => {
    const a = await proposeRegistration(
      { parcel: parcelForm, firstEvent: referenceEvent },
      proposeDeps(),
    );
    const b = await proposeRegistration(
      { parcel: { ...parcelForm, bookingRef: "BK-2" }, firstEvent: referenceEvent },
      proposeDeps(),
    );
    await ledger.approve(a.scheduleId, alice ?? "");
    await ledger.approve(a.scheduleId, bob ?? "");
    await finalizeSubmission(a.id, finalizeDeps());
    expect((await pending.listOpen()).map((s) => s.id)).toEqual([b.id]);
  });
});
