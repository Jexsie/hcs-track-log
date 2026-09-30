import { type Client, PrivateKey, ScheduleSignTransaction, type TopicId } from "@hiero-ledger/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finalizeSubmission } from "@/lib/approvals/finalize";
import { proposeRegistration } from "@/lib/approvals/propose";
import { readMirrorNodeUrl, readOperatorConfig } from "@/lib/config/env";
import { loadRootEnv } from "@/lib/config/load-env";
import { PendingSubmissionStore } from "@/lib/db/pending-store";
import { PostgresTrackingReader } from "@/lib/db/tracking-reader";
import { PostgresTrackingStore } from "@/lib/db/tracking-store";
import { createClient } from "@/lib/hedera/client";
import { createTrackingTopic } from "@/lib/hedera/create-topic";
import { HcsScheduler } from "@/lib/hedera/hcs-scheduler";
import { buildThresholdKey } from "@/lib/hedera/threshold-key";
import { fetchSchedule } from "@/lib/mirror/ledger-state";
import { createMirrorClient } from "@/lib/mirror/mirror-client";
import { verifyTimeline } from "@/lib/verify/verify-timeline";
import { createTestPool, truncateAll } from "@/test/db/database";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";

/**
 * Live testnet run of the wallet-approval flow. Each ScheduleSign below is exactly what an
 * administrator's wallet sends (paid here by the operator, signed by that administrator's key).
 * Opt in with: RUN_TESTNET_TESTS=1 npm run test
 */
loadRootEnv();
const enabled = process.env.RUN_TESTNET_TESTS === "1";

async function eventually<T>(probe: () => Promise<T | null>, timeoutMs = 90_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const value = await probe().catch(() => null);

    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error("timed out waiting for the mirror node");
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

describe.skipIf(!enabled)("wallet approvals via scheduled transactions (testnet)", () => {
  const approvers = [
    PrivateKey.generateED25519(),
    PrivateKey.generateED25519(),
    PrivateKey.generateECDSA(),
  ] as const;
  const admins = [PrivateKey.generateED25519(), PrivateKey.generateED25519()];
  const pool = createTestPool();
  let client: Client;
  let topicId: TopicId;
  let deps: {
    finalize: Parameters<typeof finalizeSubmission>[1];
    propose: Parameters<typeof proposeRegistration>[1];
  };

  beforeAll(async () => {
    await truncateAll(pool);
    await pool.query("TRUNCATE pending_submissions");
    client = createClient(readOperatorConfig());
    topicId = await createTrackingTopic(client, {
      submitKey: buildThresholdKey(
        approvers.map((k) => k.publicKey),
        2,
        "submit",
      ),
      adminKey: buildThresholdKey(
        admins.map((k) => k.publicKey),
        2,
        "admin",
      ),
      adminSigners: admins,
      memo: "hcs-track-log approvals integration test",
    });
    const mirrorBaseUrl = readMirrorNodeUrl();
    const pending = new PendingSubmissionStore(pool);

    deps = {
      propose: {
        scheduler: new HcsScheduler({ client, topicId, approvalWindowMs: 3_600_000 }),
        pending,
        cache: new PostgresTrackingStore(pool),
        proposedBy: "0.0.test",
      },
      finalize: {
        pending,
        topicId: topicId.toString(),
        readSchedule: (id) => fetchSchedule(mirrorBaseUrl, id),
        messages: createMirrorClient({ baseUrl: mirrorBaseUrl, topicId: topicId.toString() }),
      },
    };
  }, 120_000);
  afterAll(async () => {
    client?.close();
    await pool.end();
  });

  const approve = async (scheduleId: string, key: PrivateKey) => {
    const tx = await new ScheduleSignTransaction()
      .setScheduleId(scheduleId)
      .freezeWith(client)
      .sign(key);

    await (await tx.execute(client)).getReceipt(client);
  };

  it("executes only after the threshold of wallet approvals, then finalizes into a verifiable cache", async () => {
    const { createdAt: _c, ...parcelForm } = referenceParcel;
    const submission = await proposeRegistration(
      { parcel: parcelForm, firstEvent: referenceEvent },
      deps.propose,
    );

    await approve(submission.scheduleId, approvers[0]);
    const afterOne = await eventually(async () => {
      const r = await finalizeSubmission(submission.id, deps.finalize);

      return r.status === "pending" && r.approvals >= 1 ? r : null;
    });

    expect(afterOne).toMatchObject({ status: "pending" });

    await approve(submission.scheduleId, approvers[2]); // ECDSA approver completes 2-of-3
    const done = await eventually(async () => {
      const r = await finalizeSubmission(submission.id, deps.finalize);

      return r.status === "executed" ? r : null;
    });

    expect(done).toMatchObject({ status: "executed", hcsSequenceNumber: 1n });

    const reader = new PostgresTrackingReader(pool);
    const parcel = await reader.findParcel(submission.parcelHash);
    const report = await verifyTimeline({
      parcelHash: submission.parcelHash,
      parcel: parcel?.content,
      events: await reader.listEvents(submission.parcelHash),
      mirror: createMirrorClient({ baseUrl: readMirrorNodeUrl(), topicId: topicId.toString() }),
    });

    expect(report.parcel.status).toBe("verified");
    expect(report.summary).toEqual({ verified: 1, tampered: 0, unavailable: 0 });
  }, 240_000);
});
