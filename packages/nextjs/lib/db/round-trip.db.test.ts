import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildEventCanonical } from "@/lib/canonical/event";
import { buildParcelCanonical } from "@/lib/canonical/parcel";
import { computeParcelHash } from "@/lib/hashing/parcel-hash";
import { computePayloadHash } from "@/lib/hashing/payload-hash";
import { recordCargoEvent } from "@/lib/tracking/record-event";
import { registerParcel } from "@/lib/tracking/register-parcel";
import { createTestPool, truncateAll } from "@/test/db/database";
import { type Effect, InstantSubmitter } from "@/test/fakes";
import { referenceEvent, referenceParcel } from "@/test/fixtures/records";
import { PostgresTrackingReader } from "./tracking-reader";
import { PostgresTrackingStore } from "./tracking-store";

/**
 * Canonical form from input → persist → read back → rebuild from columns → identical bytes and hash.
 * Run under several session time zones: timestamptz must not drift with the server's TimeZone.
 */
const TIME_ZONES = ["UTC", "Pacific/Chatham", "America/St_Johns", "Asia/Kathmandu"];
const { createdAt: _serverAssigned, ...parcelForm } = referenceParcel;

const DECIMAL_CASES: [string, number | string, number | string][] = [
  ["trailing zero lost by JS numbers", "142.5", 0.85],
  ["JS number input", 142.5, 0.8],
  ["integer input", 12, "3"],
  ["zero", "0", 0],
  ["max NUMERIC(10,2)", "99999999.99", "0.01"],
  ["leading zeros / redundant scale", "0007.100", "0.850"],
];

const EVENT_TIMESTAMPS = [
  "2026-09-25T11:40:00Z",
  "2026-09-25T14:40:00+03:00",
  "2026-12-31T23:59:59-01:00",
  "2028-02-29T00:00:00Z",
  new Date("2026-03-29T01:00:00Z"),
];

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe.each(TIME_ZONES)("round-trip through Postgres (session TimeZone=%s)", (timeZone) => {
  const pool = createTestPool({ timeZone });
  const store = new PostgresTrackingStore(pool);
  const reader = new PostgresTrackingReader(pool);
  afterAll(() => pool.end());
  beforeEach(() => truncateAll(pool));

  it.each(DECIMAL_CASES)("parcel decimals: %s", async (_label, grossMassKg, volumeCubicMeters) => {
    const form = {
      ...parcelForm,
      consignment: { ...parcelForm.consignment, grossMassKg, volumeCubicMeters },
    };
    const now = () => new Date("2026-09-20T08:15:00.999Z");
    const { parcelHash, parcel } = await registerParcel(
      { parcel: form, firstEvent: referenceEvent },
      { submitter: new InstantSubmitter([]), store, now },
    );

    const stored = await reader.findParcel(parcelHash);
    expect(stored).not.toBeNull();
    if (!stored) return;
    expect(text(buildParcelCanonical(stored.content))).toBe(text(buildParcelCanonical(parcel)));
    expect(await computeParcelHash(stored.content)).toBe(parcelHash);
    expect(stored.content.createdAt).toBeInstanceOf(Date);
  });

  it.each(EVENT_TIMESTAMPS)("event timestamp %s", async (timestamp) => {
    const log: Effect[] = [];
    const submitter = new InstantSubmitter(log);
    const { parcelHash } = await registerParcel(
      { parcel: parcelForm, firstEvent: referenceEvent },
      { submitter, store },
    );
    const input = { ...referenceEvent, location: " Café Kampala Hub́ ", timestamp };
    await recordCargoEvent({ parcelHash, event: input }, { submitter, store });

    const [, stored] = await reader.listEvents(parcelHash);
    expect(stored).toBeDefined();
    if (!stored) return;
    const expectedBytes = buildEventCanonical(input);
    expect(buildEventCanonical(stored.content)).toEqual(expectedBytes);
    expect(await computePayloadHash(stored.content)).toBe(await computePayloadHash(input));
  });
});

describe("why fixed-scale decimals are required", () => {
  const pool = createTestPool();
  afterAll(() => pool.end());

  it("Postgres returns NUMERIC(10,2) as a fixed-scale string; JS number formatting would drift", async () => {
    const { rows } = await pool.query<{ v: string }>("SELECT 142.5::numeric(10,2) AS v");
    expect(rows[0]?.v).toBe("142.50");
    expect(String(Number(rows[0]?.v))).toBe("142.5"); // the drift our normalizer prevents
  });
});
