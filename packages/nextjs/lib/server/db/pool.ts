import pg from "pg";

/**
 * Postgres pool. Type parsing is left at pg defaults on purpose: NUMERIC arrives as a fixed-scale
 * string ("142.50") and TIMESTAMPTZ as a Date, both of which the canonical builder normalizes
 * losslessly. BIGINT arrives as a string and is converted to bigint by the row mappers.
 */
export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}
