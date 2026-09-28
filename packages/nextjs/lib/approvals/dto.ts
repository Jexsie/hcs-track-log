import type { CargoEvent } from "@/lib/canonical/event";
import type { Parcel } from "@/lib/canonical/parcel";
import type { SubmissionKind, SubmissionStatus } from "./ports";

/** A pending submission as JSON (what the admin API returns). */
export interface SubmissionDto {
  id: string;
  kind: SubmissionKind;
  parcelHash: string;
  parcel: Parcel | null;
  event: CargoEvent;
  scheduleId: string;
  expiresAt: string;
  proposedBy: string;
  proposedAt: string;
  status: SubmissionStatus;
  statusReason: string | null;
  hcsSequenceNumber: string | null;
}

export type FinalizeResultDto =
  | { status: "pending"; approvals: number; awaitingMirror: boolean }
  | { status: "executed"; hcsSequenceNumber: string }
  | { status: "expired" | "rejected"; reason: string };
