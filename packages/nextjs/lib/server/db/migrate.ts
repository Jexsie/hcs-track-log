import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../../migrations", import.meta.url));

/** Apply all pending migrations ("up") or roll back the latest one ("down"). */
export async function migrate(
  databaseUrl: string,
  direction: "up" | "down" = "up",
  log: (message: string) => void = console.log,
): Promise<void> {
  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction,
    count: direction === "up" ? Number.POSITIVE_INFINITY : 1,
    migrationsTable: "pgmigrations",
    checkOrder: true,
    singleTransaction: true,
    log,
  });
}
