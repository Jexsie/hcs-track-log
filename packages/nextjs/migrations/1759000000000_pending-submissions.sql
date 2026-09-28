-- Up Migration

-- Staging for submissions awaiting multi-party wallet approval. This is NOT the read cache:
-- the tracker and the verifier never read it. Content moves into parcels/cargo_events only after
-- the scheduled topic message has executed and the mirror node shows an envelope that matches a
-- hash recomputed from this staged content. There is deliberately no payload hash column.
CREATE TABLE pending_submissions (
  id                  UUID          PRIMARY KEY,
  kind                TEXT          NOT NULL CHECK (kind IN ('register-parcel', 'record-event')),
  parcel_hash         VARCHAR(66)   NOT NULL CHECK (parcel_hash ~ '^[0-9a-f]{64}$'),
  -- Normalized Parcel (register-parcel only) and CargoEvent, exactly as hashed at proposal time.
  parcel_content      JSONB,
  event_content       JSONB         NOT NULL,
  schedule_id         TEXT          NOT NULL UNIQUE,
  expires_at          TIMESTAMPTZ   NOT NULL,
  proposed_by         TEXT          NOT NULL,
  proposed_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  status              TEXT          NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'executed', 'expired', 'rejected')),
  status_reason       TEXT,
  hcs_sequence_number BIGINT        UNIQUE,
  finalized_at        TIMESTAMPTZ,
  CHECK ((kind = 'register-parcel') = (parcel_content IS NOT NULL))
);

CREATE INDEX pending_submissions_open_idx ON pending_submissions (proposed_at) WHERE status = 'pending';
CREATE INDEX pending_submissions_parcel_idx ON pending_submissions (parcel_hash) WHERE status = 'pending';

-- Down Migration

DROP TABLE pending_submissions;
