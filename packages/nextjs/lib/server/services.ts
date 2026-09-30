import type pg from "pg";
import type { EnvelopeScheduler } from "@/lib/approvals/ports";
import {
  readAdminSessionSecret,
  readDatabaseUrl,
  readMirrorNodeUrl,
  readTopicId,
} from "@/lib/server/config/env";
import { PendingSubmissionStore } from "@/lib/server/db/pending-store";
import { createPool } from "@/lib/server/db/pool";
import { PostgresTrackingReader } from "@/lib/server/db/tracking-reader";
import { PostgresParcelCache } from "@/lib/server/db/tracking-store";
import { createSchedulerFromEnv } from "@/lib/hedera/scheduler-from-env";
import {
  fetchAccountKey,
  fetchSchedule,
  fetchTopicKeys,
  keyMembers,
} from "@/lib/hedera/mirror/ledger-state";
import { createMirrorClient } from "@/lib/hedera/mirror/mirror-client";
import { createAdminHandlers } from "./admin-handlers";
import { consoleLogger } from "./http";

/** Process-wide singletons, kept on globalThis so dev-server hot reloads do not leak pools. */
interface Singletons {
  pool?: pg.Pool;
  scheduler?: Promise<EnvelopeScheduler>;
}
const singletons = ((globalThis as { __hcsTrackLog?: Singletons }).__hcsTrackLog ??= {});

function getPool(): pg.Pool {
  return (singletons.pool ??= createPool(readDatabaseUrl()));
}

export function getReader(): PostgresTrackingReader {
  return new PostgresTrackingReader(getPool());
}

function getScheduler(): Promise<EnvelopeScheduler> {
  singletons.scheduler ??= createSchedulerFromEnv().catch((error: unknown) => {
    singletons.scheduler = undefined; // retry on the next request instead of caching the failure
    throw error;
  });

  return singletons.scheduler;
}

export function getAdminHandlers() {
  const mirrorBaseUrl = readMirrorNodeUrl();
  const topicId = readTopicId();
  const pending = () => new PendingSubmissionStore(getPool());

  return createAdminHandlers({
    secret: readAdminSessionSecret,
    now: () => new Date(),
    secureCookies: process.env.NODE_ENV === "production",
    // Authoritative: the submit key as it is on-chain right now, not as configured.
    submitKeys: async () => keyMembers((await fetchTopicKeys(mirrorBaseUrl, topicId)).submitKey),
    resolveAccountKey: (accountId) => fetchAccountKey(mirrorBaseUrl, accountId),
    scheduler: getScheduler,
    pending,
    cache: () => new PostgresParcelCache(getPool()),
    finalizeDeps: () => ({
      pending: pending(),
      topicId,
      readSchedule: (scheduleId) => fetchSchedule(mirrorBaseUrl, scheduleId),
      messages: createMirrorClient({ baseUrl: mirrorBaseUrl, topicId }),
    }),
    log: consoleLogger,
  });
}
