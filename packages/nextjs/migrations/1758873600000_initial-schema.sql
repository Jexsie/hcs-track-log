-- Up Migration

-- Read cache derived from the HCS topic. Every row is written only AFTER its event reached consensus.
--
-- There is deliberately NO payload hash column. Verification recomputes both hashes from these
-- content columns via the shared canonical builder and compares against the ledger.
-- parcel_hash is the public tracking ID (lookup key); it is never trusted as proof: verification
-- recomputes it from the parcel columns and checks it against the searched ID and the on-chain value.

CREATE TABLE parcels (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_hash         VARCHAR(66)   NOT NULL UNIQUE CHECK (parcel_hash ~ '^[0-9a-f]{64}$'),
  description         TEXT          NOT NULL,
  package_count       INTEGER       NOT NULL CHECK (package_count > 0),
  package_type        TEXT          NOT NULL,
  gross_mass_kg       NUMERIC(10,2) NOT NULL CHECK (gross_mass_kg >= 0),
  volume_cubic_meters NUMERIC(10,2) NOT NULL CHECK (volume_cubic_meters >= 0),
  shipper             TEXT          NOT NULL,
  consignee           TEXT          NOT NULL,
  booking_ref         TEXT          NOT NULL,
  -- Whole seconds, stored as an instant: round-trips to the exact "YYYY-MM-DDTHH:MM:SSZ" string.
  created_at          TIMESTAMPTZ(0) NOT NULL
);

CREATE TABLE cargo_events (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_hash         VARCHAR(66)   NOT NULL REFERENCES parcels (parcel_hash) ON DELETE CASCADE,
  status              TEXT          NOT NULL,
  location            TEXT          NOT NULL,
  carrier_name        TEXT          NOT NULL,
  carrier_scac_code   VARCHAR(4)    NOT NULL,
  event_timestamp     TIMESTAMPTZ(0) NOT NULL,
  payer_account_id    TEXT          NOT NULL,
  hcs_sequence_number BIGINT        NOT NULL UNIQUE CHECK (hcs_sequence_number > 0),
  recorded_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- parcels.parcel_hash and cargo_events.hcs_sequence_number are indexed by their UNIQUE constraints.
-- Timeline lookups: all events of a parcel in ledger order.
CREATE INDEX cargo_events_parcel_hash_seq_idx ON cargo_events (parcel_hash, hcs_sequence_number);

COMMENT ON COLUMN cargo_events.payer_account_id IS
  'Convenience copy only; NOT covered by payloadHash. The mirror node transaction record is authoritative.';
COMMENT ON COLUMN cargo_events.hcs_sequence_number IS
  'Sequence number of this event''s envelope on HCS_TOPIC_ID; locates the on-chain anchor.';

-- Down Migration

DROP TABLE cargo_events;
DROP TABLE parcels;
