import { afterAll, describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/migrate";
import { TEST_DATABASE_URL, createTestPool } from "@/test/db/database";

const pool = createTestPool();
afterAll(() => pool.end());

async function columns(table: string) {
  const { rows } = await pool.query<{ column_name: string; type: string }>(
    `SELECT attname AS column_name, format_type(atttypid, atttypmod) AS type
       FROM pg_attribute
      WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped
      ORDER BY attnum`,
    [table],
  );
  return Object.fromEntries(rows.map((r) => [r.column_name, r.type]));
}

describe("schema", () => {
  it("parcels has the specified columns and types", async () => {
    expect(await columns("parcels")).toEqual({
      id: "uuid",
      parcel_hash: "character varying(66)",
      description: "text",
      package_count: "integer",
      package_type: "text",
      gross_mass_kg: "numeric(10,2)",
      volume_cubic_meters: "numeric(10,2)",
      shipper: "text",
      consignee: "text",
      booking_ref: "text",
      created_at: "timestamp(0) with time zone",
    });
  });

  it("cargo_events has the specified columns and types", async () => {
    expect(await columns("cargo_events")).toEqual({
      id: "uuid",
      parcel_hash: "character varying(66)",
      status: "text",
      location: "text",
      carrier_name: "text",
      carrier_scac_code: "character varying(4)",
      event_timestamp: "timestamp(0) with time zone",
      payer_account_id: "text",
      hcs_sequence_number: "bigint",
      recorded_at: "timestamp with time zone",
    });
  });

  it("stores no hash column other than the parcel_hash lookup key", async () => {
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name ILIKE '%hash%' ORDER BY table_name`,
    );
    expect(rows).toEqual([
      { table_name: "cargo_events", column_name: "parcel_hash" },
      { table_name: "parcels", column_name: "parcel_hash" },
    ]);
  });

  it("indexes parcel_hash on both tables and hcs_sequence_number", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('parcels', 'cargo_events')`,
    );
    const defs = rows.map((r) => r.indexdef);
    expect(defs).toContainEqual(
      expect.stringMatching(/UNIQUE INDEX .* ON public\.parcels .*\(parcel_hash\)/),
    );
    expect(defs).toContainEqual(
      expect.stringMatching(/ON public\.cargo_events .*\(parcel_hash, hcs_sequence_number\)/),
    );
    expect(defs).toContainEqual(
      expect.stringMatching(/UNIQUE INDEX .* ON public\.cargo_events .*\(hcs_sequence_number\)/),
    );
  });

  it("migrations roll back and re-apply cleanly", async () => {
    await migrate(TEST_DATABASE_URL, "down", () => {});
    const { rows } = await pool.query(`SELECT to_regclass('public.parcels') AS t`);
    expect(rows[0]).toEqual({ t: null });
    await migrate(TEST_DATABASE_URL, "up", () => {});
    expect(Object.keys(await columns("parcels"))).toContain("parcel_hash");
  });
});
