import type pg from "pg";
import { readDatabaseUrl, readSubmitterApiToken } from "@/lib/config/env";
import { createPool } from "@/lib/db/pool";
import { PostgresTrackingReader } from "@/lib/db/tracking-reader";
import { PostgresTrackingStore } from "@/lib/db/tracking-store";
import { createSubmitterFromEnv } from "@/lib/hedera/submitter-from-env";
import type { EnvelopeSubmitter } from "@/lib/tracking/ports";
import { consoleLogger } from "./http";
import { createWriteHandlers } from "./write-handlers";

/** Process-wide singletons, kept on globalThis so dev-server hot reloads do not leak pools. */
interface Singletons {
  pool?: pg.Pool;
  submitter?: Promise<EnvelopeSubmitter>;
}
const singletons = ((globalThis as { __hcsTrackLog?: Singletons }).__hcsTrackLog ??= {});

export function getPool(): pg.Pool {
  return (singletons.pool ??= createPool(readDatabaseUrl()));
}

export function getReader(): PostgresTrackingReader {
  return new PostgresTrackingReader(getPool());
}

function getSubmitter(): Promise<EnvelopeSubmitter> {
  singletons.submitter ??= createSubmitterFromEnv().catch((error: unknown) => {
    singletons.submitter = undefined; // retry on the next request instead of caching the failure
    throw error;
  });
  return singletons.submitter;
}

export function getWriteHandlers() {
  return createWriteHandlers({
    store: new PostgresTrackingStore(getPool()),
    getSubmitter,
    apiToken: readSubmitterApiToken,
    log: consoleLogger,
  });
}
