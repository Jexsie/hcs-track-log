import type pg from "pg";
import type { Parcel } from "@/lib/canonical/parcel";
import type { RecordedEvent, TrackingStore } from "@/lib/tracking/ports";

/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Queryable = Pick<pg.PoolClient, "query">;

/**
 * `ifAbsent` skips the insert when the parcel is already cached. That is safe only because
 * parcel_hash is the SHA-256 of the parcel content: an existing row for this hash was written from
 * the same content.
 */
export async function insertParcelRow(
  db: Queryable,
  parcelHash: string,
  parcel: Parcel,
  { ifAbsent = false }: { ifAbsent?: boolean } = {},
): Promise<void> {
  await db.query(
    `INSERT INTO parcels
       (parcel_hash, description, package_count, package_type, gross_mass_kg,
        volume_cubic_meters, shipper, consignee, booking_ref, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ${ifAbsent ? "ON CONFLICT (parcel_hash) DO NOTHING" : ""}`,
    [
      parcelHash,
      parcel.consignment.description,
      parcel.consignment.packageCount,
      parcel.consignment.packageType,
      parcel.consignment.grossMassKg,
      parcel.consignment.volumeCubicMeters,
      parcel.parties.shipper,
      parcel.parties.consignee,
      parcel.bookingRef,
      parcel.createdAt,
    ],
  );
}

export async function insertEventRow(
  db: Queryable,
  { parcelHash, event, payerAccountId, hcsSequenceNumber }: RecordedEvent,
): Promise<void> {
  await db.query(
    `INSERT INTO cargo_events
       (parcel_hash, status, location, carrier_name, carrier_scac_code, event_timestamp,
        payer_account_id, hcs_sequence_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      parcelHash,
      event.status,
      event.location,
      event.carrier.name,
      event.carrier.scacCode,
      event.timestamp,
      payerAccountId,
      hcsSequenceNumber.toString(),
    ],
  );
}

/** Run `work` in a transaction; rolls back on any error. */
export async function inTransaction<T>(
  pool: pg.Pool,
  work: (db: Queryable) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Derived writes. Called by the tracking services only after consensus success. */
export class PostgresTrackingStore implements TrackingStore {
  constructor(private readonly pool: pg.Pool) {}

  async parcelExists(parcelHash: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("SELECT 1 FROM parcels WHERE parcel_hash = $1", [
      parcelHash,
    ]);
    return rowCount === 1;
  }

  async insertParcelWithFirstEvent(parcel: Parcel, event: RecordedEvent): Promise<void> {
    await inTransaction(this.pool, async (db) => {
      await insertParcelRow(db, event.parcelHash, parcel);
      await insertEventRow(db, event);
    });
  }

  async insertEvent(event: RecordedEvent): Promise<void> {
    await insertEventRow(this.pool, event);
  }
}
