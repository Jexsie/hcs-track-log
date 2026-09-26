import type { CargoEventInput } from "@/lib/canonical/event";
import type { ParcelInput } from "@/lib/canonical/parcel";

export interface ParcelRow {
  parcel_hash: string;
  description: string;
  package_count: number;
  package_type: string;
  gross_mass_kg: string;
  volume_cubic_meters: string;
  shipper: string;
  consignee: string;
  booking_ref: string;
  created_at: Date;
}

export interface CargoEventRow {
  id: string;
  parcel_hash: string;
  status: string;
  location: string;
  carrier_name: string;
  carrier_scac_code: string;
  event_timestamp: Date;
  payer_account_id: string;
  hcs_sequence_number: string;
  recorded_at: Date;
}

/** A parcel as cached. `content` is raw column data, shaped for the shared canonical builder. */
export interface StoredParcel {
  parcelHash: string;
  content: ParcelInput;
}

/** An event as cached. `content` is raw column data, shaped for the shared canonical builder. */
export interface StoredEvent {
  id: string;
  parcelHash: string;
  hcsSequenceNumber: bigint;
  /** Convenience copy only; NOT covered by payloadHash. */
  payerAccountId: string;
  recordedAt: Date;
  content: CargoEventInput;
}

export function toStoredParcel(row: ParcelRow): StoredParcel {
  return {
    parcelHash: row.parcel_hash,
    content: {
      consignment: {
        description: row.description,
        packageCount: row.package_count,
        packageType: row.package_type,
        grossMassKg: row.gross_mass_kg,
        volumeCubicMeters: row.volume_cubic_meters,
      },
      parties: { shipper: row.shipper, consignee: row.consignee },
      bookingRef: row.booking_ref,
      createdAt: row.created_at,
    },
  };
}

export function toStoredEvent(row: CargoEventRow): StoredEvent {
  return {
    id: row.id,
    parcelHash: row.parcel_hash,
    hcsSequenceNumber: BigInt(row.hcs_sequence_number),
    payerAccountId: row.payer_account_id,
    recordedAt: row.recorded_at,
    content: {
      status: row.status,
      location: row.location,
      carrier: { name: row.carrier_name, scacCode: row.carrier_scac_code },
      timestamp: row.event_timestamp,
    },
  };
}
