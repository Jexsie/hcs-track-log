/**
 * npm run db:seed
 *
 * Seeds a demo parcel with a short journey. Goes through the real HCS-first path, so it needs a
 * configured topic and signers, and every seeded event is verifiable against the ledger.
 */
import { readDatabaseUrl } from "@/lib/config/env";
import { loadRootEnv } from "@/lib/config/load-env";
import { createPool } from "@/lib/db/pool";
import { PostgresTrackingStore } from "@/lib/db/tracking-store";
import { createSubmitterFromEnv } from "@/lib/hedera/submitter-from-env";
import { recordCargoEvent } from "@/lib/tracking/record-event";
import { registerParcel } from "@/lib/tracking/register-parcel";

const HOUR = 3_600_000;
const carrier = { name: "MTN Logistics", scacCode: "MTNL" };

async function main(): Promise<void> {
  loadRootEnv();
  const pool = createPool(readDatabaseUrl());
  const submitter = await createSubmitterFromEnv();
  const store = new PostgresTrackingStore(pool);
  const at = (hoursAgo: number) =>
    new Date(Math.floor((Date.now() - hoursAgo * HOUR) / 1000) * 1000);

  try {
    const { parcelHash } = await registerParcel(
      {
        parcel: {
          consignment: {
            description: "Arabica coffee beans, green, jute bags",
            packageCount: 12,
            packageType: "Bag",
            grossMassKg: "142.50",
            volumeCubicMeters: "0.85",
          },
          parties: { shipper: "Bugisu Coffee Co-op, Mbale", consignee: "Hamburg Roasters GmbH" },
          bookingRef: `BK-DEMO-${Date.now()}`,
        },
        firstEvent: { status: "Booked", location: "Mbale, Uganda", carrier, timestamp: at(72) },
      },
      { submitter, store },
    );

    console.log(`Registered parcel ${parcelHash}`);

    for (const [status, location, hoursAgo] of [
      ["Picked Up", "Mbale, Uganda", 60],
      ["In Transit", "Kampala Hub, Uganda", 36],
      ["At Hub", "Mombasa Port, Kenya", 6],
    ] as const) {
      const { hcsSequenceNumber } = await recordCargoEvent(
        { parcelHash, event: { status, location, carrier, timestamp: at(hoursAgo) } },
        { submitter, store },
      );

      console.log(`  ${status.padEnd(10)} → HCS sequence ${hcsSequenceNumber}`);
    }

    console.log(`\n✅ Search for this tracking ID:\n\n  ${parcelHash}\n`);
  } finally {
    submitter.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
