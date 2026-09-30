import type { PostgresTrackingReader } from "@/lib/server/db/tracking-reader";
import { EnvelopeError, parseEnvelope } from "@/lib/notary/envelope";
import type { MirrorClient } from "@/lib/hedera/mirror/mirror-client";
import { type TimelineReport, verifyTimeline } from "./verify-timeline";

export interface TopicReport {
  parcels: { parcelHash: string; report: TimelineReport }[];
  /** Envelopes on the ledger with no cached event row (e.g. a failed derived write). */
  uncached: bigint[];
  /** Ledger messages that are not event envelopes. */
  foreign: bigint[];
  totals: {
    parcels: number;
    verified: number;
    tampered: number;
    unavailable: number;
    tamperedParcels: number;
  };
}

export interface VerifyTopicOptions {
  reader: Pick<PostgresTrackingReader, "findParcel" | "listEvents" | "listParcelHashes">;
  mirror: MirrorClient;
  /** Limit to one parcel (implies no topic scan). */
  parcelHash?: string;
  /** Page through the whole topic to find uncached/foreign messages (default: true). */
  scanLedger?: boolean;
  onParcel?: (parcelHash: string, report: TimelineReport) => void;
  /** Called every 1000 scanned ledger messages. */
  onScanProgress?: (scanned: number) => void;
}

/** Verify every cached event against the ledger by recomputation, then scan the topic for gaps. */
export async function verifyTopic({
  reader,
  mirror,
  parcelHash,
  scanLedger = true,
  onParcel,
  onScanProgress,
}: VerifyTopicOptions): Promise<TopicReport> {
  const hashes = parcelHash ? [parcelHash] : await reader.listParcelHashes();
  const parcels: TopicReport["parcels"] = [];
  const cachedSequences = new Set<bigint>();

  for (const hash of hashes) {
    const parcel = await reader.findParcel(hash);

    if (!parcel) continue;
    const events = await reader.listEvents(hash);

    for (const e of events) cachedSequences.add(e.hcsSequenceNumber);
    const report = await verifyTimeline({
      parcelHash: hash,
      parcel: parcel.content,
      events,
      mirror,
    });

    parcels.push({ parcelHash: hash, report });
    onParcel?.(hash, report);
  }

  const uncached: bigint[] = [];
  const foreign: bigint[] = [];

  if (scanLedger && !parcelHash) {
    let scanned = 0;

    for await (const message of mirror.listMessages()) {
      if (++scanned % 1000 === 0) onScanProgress?.(scanned);

      try {
        parseEnvelope(message.message);
      } catch (error) {
        if (!(error instanceof EnvelopeError)) throw error;
        foreign.push(message.sequenceNumber);
        continue;
      }

      if (!cachedSequences.has(message.sequenceNumber)) uncached.push(message.sequenceNumber);
    }
  }

  const totals = {
    parcels: parcels.length,
    verified: 0,
    tampered: 0,
    unavailable: 0,
    tamperedParcels: 0,
  };

  for (const { report } of parcels) {
    totals.verified += report.summary.verified;
    totals.tampered += report.summary.tampered;
    totals.unavailable += report.summary.unavailable;
    if (report.parcel.status === "tampered") totals.tamperedParcels++;
  }

  return { parcels, uncached, foreign, totals };
}

/** `npm run verify` exit codes. */
const EXIT = { verified: 0, tampered: 1, incomplete: 2, missingFromCache: 3 } as const;

/**
 * Changed content outranks everything. Ledger envelopes with no cached row come next: a row deleted
 * from Postgres looks exactly like this, as does an approved change that has not been finalized yet,
 * so it must not pass as "verified". An unreachable mirror node only makes the run incomplete.
 */
export function verifyExitCode({ totals, uncached }: Pick<TopicReport, "totals" | "uncached">) {
  if (totals.tampered || totals.tamperedParcels) return EXIT.tampered;
  if (uncached.length) return EXIT.missingFromCache;

  return totals.unavailable ? EXIT.incomplete : EXIT.verified;
}
