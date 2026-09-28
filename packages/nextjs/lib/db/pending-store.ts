import type pg from "pg";
import type { CargoEvent } from "@/lib/canonical/event";
import type { Parcel } from "@/lib/canonical/parcel";
import type {
  NewSubmission,
  PendingStore,
  PendingSubmission,
  SubmissionKind,
  SubmissionStatus,
} from "@/lib/approvals/ports";
import type { RecordedEvent } from "@/lib/tracking/ports";
import { inTransaction, insertEventRow, insertParcelRow } from "./tracking-store";

interface Row {
  id: string;
  kind: SubmissionKind;
  parcel_hash: string;
  parcel_content: Parcel | null;
  event_content: CargoEvent;
  schedule_id: string;
  expires_at: Date;
  proposed_by: string;
  proposed_at: Date;
  status: SubmissionStatus;
  status_reason: string | null;
  hcs_sequence_number: string | null;
}

const COLUMNS = `id, kind, parcel_hash, parcel_content, event_content, schedule_id, expires_at,
  proposed_by, proposed_at, status, status_reason, hcs_sequence_number`;

const toSubmission = (r: Row): PendingSubmission => ({
  id: r.id,
  kind: r.kind,
  parcelHash: r.parcel_hash,
  parcel: r.parcel_content,
  event: r.event_content,
  scheduleId: r.schedule_id,
  expiresAt: r.expires_at,
  proposedBy: r.proposed_by,
  proposedAt: r.proposed_at,
  status: r.status,
  statusReason: r.status_reason,
  hcsSequenceNumber: r.hcs_sequence_number === null ? null : BigInt(r.hcs_sequence_number),
});

/** Staging for multi-party approval. Never read by the tracker or verifier. */
export class PendingSubmissionStore implements PendingStore {
  constructor(private readonly pool: pg.Pool) {}

  async insert(s: NewSubmission): Promise<PendingSubmission> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO pending_submissions
         (id, kind, parcel_hash, parcel_content, event_content, schedule_id, expires_at, proposed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        s.id,
        s.kind,
        s.parcelHash,
        s.parcel === null ? null : JSON.stringify(s.parcel),
        JSON.stringify(s.event),
        s.scheduleId,
        s.expiresAt,
        s.proposedBy,
      ],
    );
    const [row] = rows;
    if (!row) throw new Error("insert returned no row");
    return toSubmission(row);
  }

  async get(id: string): Promise<PendingSubmission | null> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const { rows } = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM pending_submissions WHERE id = $1`,
      [id],
    );
    const [row] = rows;
    return row ? toSubmission(row) : null;
  }

  async listOpen(): Promise<PendingSubmission[]> {
    const { rows } = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM pending_submissions WHERE status = 'pending' ORDER BY proposed_at`,
    );
    return rows.map(toSubmission);
  }

  async hasOpenRegistration(parcelHash: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `SELECT 1 FROM pending_submissions WHERE parcel_hash = $1 AND kind = 'register-parcel' AND status = 'pending'`,
      [parcelHash],
    );
    return (rowCount ?? 0) > 0;
  }

  async complete(submission: PendingSubmission, recorded: RecordedEvent): Promise<void> {
    await inTransaction(this.pool, async (db) => {
      const { rowCount } = await db.query(
        `UPDATE pending_submissions
            SET status = 'executed', hcs_sequence_number = $2, finalized_at = now()
          WHERE id = $1 AND status = 'pending'`,
        [submission.id, recorded.hcsSequenceNumber.toString()],
      );
      if (rowCount !== 1) return; // finalized concurrently by another request
      if (submission.kind === "register-parcel" && submission.parcel) {
        await insertParcelRow(db, submission.parcelHash, submission.parcel);
      }
      await insertEventRow(db, recorded);
    });
  }

  async close(id: string, status: "expired" | "rejected", reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE pending_submissions SET status = $2, status_reason = $3, finalized_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [id, status, reason],
    );
  }
}
