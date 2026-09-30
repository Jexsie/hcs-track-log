import { PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { normalizeCargoEvent } from "@/lib/canonical/event";
import { normalizeParcel } from "@/lib/canonical/parcel";
import { computeParcelHash } from "@/lib/hashing/parcel-hash";
import type { ScheduleState } from "@/lib/mirror/ledger-state";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { expectedEnvelope } from "./expected-envelope";
import { approvalProgress, checkScheduledMessage } from "./scheduled-check";

const parcel = normalizeParcel(referenceParcel);
const event = normalizeCargoEvent(referenceEvent);

async function registration() {
  return {
    kind: "register-parcel" as const,
    parcelHash: await computeParcelHash(parcel),
    parcel,
    event,
  };
}

function schedule(
  message: Uint8Array | null,
  topicId = "0.0.5005",
  signerPublicKeys: Uint8Array[] = [],
): ScheduleState {
  return {
    scheduleId: "0.0.777",
    executedTimestamp: null,
    deleted: false,
    expirationTime: null,
    signerPublicKeys,
    scheduledMessage: message ? { topicId, message } : null,
  };
}

describe("checkScheduledMessage (what an approver's browser checks before signing)", () => {
  it("accepts a schedule whose message equals the envelope recomputed from the displayed content", async () => {
    const sub = await registration();
    const envelope = await expectedEnvelope(sub);

    expect(envelope).not.toBeNull();
    expect(checkScheduledMessage(envelope, schedule(envelope), "0.0.5005")).toEqual({ ok: true });
  });

  it("refuses when the content, topic or schedule type differ", async () => {
    const sub = await registration();
    const envelope = await expectedEnvelope(sub);
    const other = await expectedEnvelope({
      ...sub,
      event: { ...event, location: "Elsewhere" },
    });

    expect(checkScheduledMessage(other, schedule(envelope), "0.0.5005")).toMatchObject({
      ok: false,
    });
    expect(
      checkScheduledMessage(envelope, schedule(envelope, "0.0.9999"), "0.0.5005"),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("topic") });
    expect(checkScheduledMessage(envelope, schedule(null), "0.0.5005")).toMatchObject({
      ok: false,
    });
  });

  it("refuses a registration whose parcel details do not hash to its tracking ID", async () => {
    const sub = await registration();

    expect(await expectedEnvelope({ ...sub, parcelHash: "f".repeat(64) })).toBeNull();
  });
});

describe("approvalProgress", () => {
  const [a, b, c] = [0, 1, 2].map(() => PrivateKey.generateED25519().publicKey);

  it("counts only signatures by submit-key members, and knows if the current wallet already signed", () => {
    if (!a || !b || !c) throw new Error("keys");
    const outsider = PrivateKey.generateED25519().publicKey;
    const progress = approvalProgress(
      [a.toBytesRaw(), outsider.toBytesRaw()],
      {
        kind: "threshold",
        threshold: 2,
        keys: [a, b, c].map((k) => ({ kind: "ed25519", publicKey: k.toBytesRaw() })),
      },
      a,
    );

    expect(progress).toEqual({
      approvals: 1,
      required: 2,
      authorizedKeys: 3,
      alreadySignedByYou: true,
      youCanApprove: true,
    });
    const other = approvalProgress(
      [],
      { kind: "threshold", threshold: 2, keys: [{ kind: "ed25519", publicKey: b.toBytesRaw() }] },
      outsider,
    );

    expect(other).toMatchObject({ approvals: 0, youCanApprove: false });
  });
});
