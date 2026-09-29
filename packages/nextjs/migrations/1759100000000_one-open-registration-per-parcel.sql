-- Up Migration

-- At most one registration per parcel may await approval. The application checks this before it
-- stages a proposal, but two concurrent requests can both pass that check. Both create a schedule on
-- Hedera; with this index only the first is staged, so nobody sees or approves the second and it
-- expires unused.

-- Existing duplicates would make the index fail: keep the earliest open registration per parcel and
-- close the rest. Not reversed by the down migration.
UPDATE pending_submissions AS later
   SET status = 'rejected',
       status_reason = 'duplicate registration: an earlier proposal for this parcel is open',
       finalized_at = now()
 WHERE later.kind = 'register-parcel'
   AND later.status = 'pending'
   AND EXISTS (
     SELECT 1 FROM pending_submissions AS earlier
      WHERE earlier.parcel_hash = later.parcel_hash
        AND earlier.kind = 'register-parcel'
        AND earlier.status = 'pending'
        AND (earlier.proposed_at, earlier.id) < (later.proposed_at, later.id)
   );

CREATE UNIQUE INDEX pending_submissions_open_registration_idx
  ON pending_submissions (parcel_hash)
  WHERE kind = 'register-parcel' AND status = 'pending';

-- Down Migration

DROP INDEX pending_submissions_open_registration_idx;
