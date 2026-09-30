import type pg from "pg";
import {
  type CargoEventRow,
  type ParcelRow,
  type StoredEvent,
  type StoredParcel,
  toStoredEvent,
  toStoredParcel,
} from "./rows";

/** Database-first reads for the timeline. Returns content only; hashes are always recomputed. */
export class PostgresTrackingReader {
  constructor(private readonly pool: pg.Pool) {}

  async findParcel(parcelHash: string): Promise<StoredParcel | null> {
    const { rows } = await this.pool.query<ParcelRow>(
      `SELECT parcel_hash, description, package_count, package_type, gross_mass_kg,
              volume_cubic_meters, shipper, consignee, booking_ref, created_at
         FROM parcels WHERE parcel_hash = $1`,
      [parcelHash],
    );
    const [row] = rows;

    return row ? toStoredParcel(row) : null;
  }

  async listParcelHashes(): Promise<string[]> {
    const { rows } = await this.pool.query<{ parcel_hash: string }>(
      "SELECT parcel_hash FROM parcels ORDER BY created_at, parcel_hash",
    );

    return rows.map((r) => r.parcel_hash);
  }

  async listEvents(parcelHash: string): Promise<StoredEvent[]> {
    const { rows } = await this.pool.query<CargoEventRow>(
      `SELECT id, parcel_hash, status, location, carrier_name, carrier_scac_code, event_timestamp,
              payer_account_id, hcs_sequence_number, recorded_at
         FROM cargo_events WHERE parcel_hash = $1
        ORDER BY hcs_sequence_number`,
      [parcelHash],
    );

    return rows.map(toStoredEvent);
  }
}
