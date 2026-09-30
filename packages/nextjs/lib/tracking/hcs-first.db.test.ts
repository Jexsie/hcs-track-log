import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresTrackingReader } from "@/lib/db/tracking-reader";
import { PostgresTrackingStore } from "@/lib/db/tracking-store";
import { createTestPool, truncateAll } from "@/test/db/database";
import { type Effect, InstantSubmitter } from "@/test/fakes";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { SubmissionFailedError } from "./errors";
import { recordCargoEvent } from "./record-event";
import { registerParcel } from "./register-parcel";

const pool = createTestPool();
const store = new PostgresTrackingStore(pool);
const reader = new PostgresTrackingReader(pool);

afterAll(() => pool.end());
beforeEach(() => truncateAll(pool));

const { createdAt: _createdAt, ...parcelForm } = referenceParcel;
const count = async (table: "parcels" | "cargo_events") =>
  Number((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n);

describe("HCS-first against real Postgres", () => {
  it("leaves both tables empty when parcel registration fails at the ledger", async () => {
    const submitter = new InstantSubmitter([], new Error("INVALID_SIGNATURE"));

    await expect(
      registerParcel({ parcel: parcelForm, firstEvent: referenceEvent }, { submitter, store }),
    ).rejects.toThrow(SubmissionFailedError);
    expect(await count("parcels")).toBe(0);
    expect(await count("cargo_events")).toBe(0);
  });

  it("adds no event row when an event submission fails", async () => {
    const log: Effect[] = [];
    const { parcelHash } = await registerParcel(
      { parcel: parcelForm, firstEvent: referenceEvent },
      { submitter: new InstantSubmitter(log), store },
    );

    await expect(
      recordCargoEvent(
        { parcelHash, event: { ...referenceEvent, status: "Delivered" } },
        { submitter: new InstantSubmitter(log, new Error("BUSY")), store },
      ),
    ).rejects.toThrow(SubmissionFailedError);
    const events = await reader.listEvents(parcelHash);

    expect(events.map((e) => e.content.status)).toEqual(["In Transit"]);
  });
});
