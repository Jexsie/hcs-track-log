import pg from "pg";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://hcs:hcs@localhost:5432/hcs_track_log_test";

/** The suite drops the schema of this database, so refuse anything not clearly a test database. */
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.slice(1);

  if (!name.endsWith("_test")) {
    throw new Error(
      `TEST_DATABASE_URL must point at a database whose name ends in _test, got "${name}"`,
    );
  }
}

export function createTestPool(options: { timeZone?: string } = {}): pg.Pool {
  return new pg.Pool({
    connectionString: TEST_DATABASE_URL,
    max: 4,
    ...(options.timeZone ? { options: `-c TimeZone=${options.timeZone}` } : {}),
  });
}

export async function truncateAll(pool: pg.Pool): Promise<void> {
  await pool.query("TRUNCATE cargo_events, parcels");
}
