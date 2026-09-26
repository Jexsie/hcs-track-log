/**
 * npm run verify -- --topic 0.0.x [--parcel <trackingId>] [--mirror <url>] [--skip-scan]
 *
 * --skip-scan  do not page through the whole topic looking for uncached messages
 *
 * Recomputes every cached event's hash from Postgres content and compares it with the envelope on
 * the topic (via the mirror node). Exit code: 0 all verified, 1 tampering found, 2 incomplete.
 */
import { parseArgs } from "node:util";
import { readDatabaseUrl, readMirrorNodeUrl, readTopicId } from "@/lib/config/env";
import { loadRootEnv } from "@/lib/config/load-env";
import { createPool } from "@/lib/db/pool";
import { PostgresTrackingReader } from "@/lib/db/tracking-reader";
import { normalizeHashInput } from "@/lib/hashing/sha256";
import { createMirrorClient } from "@/lib/mirror/mirror-client";
import type { TimelineReport } from "@/lib/verify/verify-timeline";
import { verifyTopic } from "@/lib/verify/verify-topic";

const ICON = { verified: "✅", tampered: "⚠️ ", unavailable: "…" } as const;

function printParcel(parcelHash: string, report: TimelineReport): void {
  const parcelLine =
    report.parcel.status === "verified"
      ? "✅ parcel content"
      : `⚠️  PARCEL TAMPERED: ${report.parcel.message}`;
  console.log(`\n${parcelHash}\n  ${parcelLine}`);
  for (const v of report.events) {
    const detail =
      v.status === "verified"
        ? "verified against ledger"
        : v.status === "tampered"
          ? `TAMPERED (${v.reason}): ${v.message}`
          : `unavailable: ${v.message}`;
    console.log(`  ${ICON[v.status]} seq ${v.sequenceNumber}  ${detail}`);
  }
}

async function main(): Promise<number> {
  loadRootEnv();
  const { values } = parseArgs({
    options: {
      topic: { type: "string" },
      parcel: { type: "string" },
      mirror: { type: "string" },
      "skip-scan": { type: "boolean", default: false },
    },
  });
  const topicId = values.topic ?? readTopicId();
  const parcelHash = values.parcel === undefined ? undefined : normalizeHashInput(values.parcel);
  if (parcelHash === null) throw new Error("--parcel must be a 64-character hex tracking ID");

  const mirror = createMirrorClient({ baseUrl: values.mirror ?? readMirrorNodeUrl(), topicId });
  const pool = createPool(readDatabaseUrl());
  try {
    console.log(
      `Verifying against topic ${topicId} (recomputing every hash from Postgres content)…`,
    );
    const report = await verifyTopic({
      reader: new PostgresTrackingReader(pool),
      mirror,
      ...(parcelHash ? { parcelHash } : {}),
      scanLedger: !values["skip-scan"],
      onParcel: printParcel,
      onScanProgress: (n) => console.log(`  …scanned ${n} ledger messages`),
    });
    const t = report.totals;
    console.log(
      `\n${t.parcels} parcels · ${t.verified} verified · ${t.tampered} tampered events · ` +
        `${t.tamperedParcels} tampered parcels · ${t.unavailable} unavailable`,
    );
    if (report.uncached.length)
      console.log(`ℹ️  on ledger but not cached: seq ${report.uncached.join(", ")}`);
    if (report.foreign.length)
      console.log(`ℹ️  non-envelope messages on topic: seq ${report.foreign.join(", ")}`);
    if (t.tampered || t.tamperedParcels) return 1;
    return t.unavailable ? 2 : 0;
  } finally {
    await pool.end();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  });
