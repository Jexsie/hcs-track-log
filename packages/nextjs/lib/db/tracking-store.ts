import type pg from "pg";
import type { Parcel } from "@/lib/canonical/parcel";
import type { RecordedEvent, TrackingStore } from "@/lib/tracking/ports";

const INSERT_EVENT = `
  INSERT INTO cargo_events
    (parcel_hash, status, location, carrier_name, carrier_scac_code, event_timestamp,
     payer_account_id, hcs_sequence_number)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;

function eventParams({ parcelHash, event, payerAccountId, hcsSequenceNumber }: RecordedEvent) {
  return [
    parcelHash,
    event.status,
    event.location,
    event.carrier.name,
    event.carrier.scacCode,
    event.timestamp,
    payerAccountId,
    hcsSequenceNumber.toString(),
  ];
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO parcels
           (parcel_hash, description, package_count, package_type, gross_mass_kg,
            volume_cubic_meters, shipper, consignee, booking_ref, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          event.parcelHash,
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
      await client.query(INSERT_EVENT, eventParams(event));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async insertEvent(event: RecordedEvent): Promise<void> {
    await this.pool.query(INSERT_EVENT, eventParams(event));
  }
}
