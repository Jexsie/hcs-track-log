import pg from "pg";
import { migrate } from "@/lib/db/migrate";
import { TEST_DATABASE_URL, assertTestDatabase } from "./database";

/** Fresh schema + all migrations, once per `npm run test`. */
export default async function setup(): Promise<void> {
  assertTestDatabase(TEST_DATABASE_URL);
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  } catch (error) {
    const { host, pathname } = new URL(TEST_DATABASE_URL);
    throw new Error(
      `Cannot reach the test database ${host}${pathname}. Postgres is required: run \`docker compose up -d\`.`,
      { cause: error },
    );
  } finally {
    await pool.end();
  }
  await migrate(TEST_DATABASE_URL, "up", () => {});
}
