/**
 * npm run db:migrate            apply all pending migrations
 * npm run db:migrate -- --down  roll back the latest migration
 */
import { parseArgs } from "node:util";
import { readDatabaseUrl } from "@/lib/config/env";
import { loadRootEnv } from "@/lib/config/load-env";
import { migrate } from "@/lib/db/migrate";

const { values } = parseArgs({ options: { down: { type: "boolean", default: false } } });

loadRootEnv();
migrate(readDatabaseUrl(), values.down ? "down" : "up")
  .then(() => console.log("✅ migrations complete"))
  .catch((error: unknown) => {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
