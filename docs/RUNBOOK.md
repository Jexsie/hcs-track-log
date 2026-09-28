# Runbook

Operating Kivu Cargo's shipment tracker: the Next.js app, Postgres, and the HCS topic on Hedera.

## What depends on what

| Component                           | Role                                                                    | If it is down                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Hedera topic** (`HCS_TOPIC_ID`)   | Source of truth: one `{ v, parcelHash, payloadHash }` anchor per update | Staff can't publish. Customers still see cached data, marked "Not checked"       |
| **Mirror node** (`MIRROR_NODE_URL`) | Read access to the anchors and schedules                                | Verification shows "Not checked". The staff API returns `503 LEDGER_UNAVAILABLE` |
| **Postgres** (`DATABASE_URL`)       | The **only** copy of shipment details (they are never on-chain)         | Tracking and the staff portal fail                                               |
| **Operator account**                | Pays for topic creation and schedules. Must **not** be a submit key     | Staff can't propose (`SUBMISSION_FAILED`)                                        |
| **Staff wallets**                   | Hold the submit keys and approve every change                           | Changes stay pending until approvals arrive                                      |

> **Back up Postgres.** Shipment details exist nowhere else. The ledger can prove the details are unchanged, but it
> cannot restore them.

## Deploying

1. **One-time: create the topic.** Set `HCS_SUBMIT_PUBLIC_KEYS` to the staff wallets' public keys, `HCS_SUBMIT_THRESHOLD` (≥ 2), and
   `HCS_ADMIN_*` in a secure shell. Run `npm run topic:create`, then store the printed id as `HCS_TOPIC_ID`. Do **not**
   deploy `HCS_ADMIN_SIGNER_KEYS` or `HCS_SUBMIT_SIGNER_KEYS` to the server.
2. **Configure the environment.** All variables are listed in the [README](../README.md#environment-variables). The staff portal also needs
   `ADMIN_SESSION_SECRET` (`openssl rand -hex 32`) and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. The staff layout reads both
   on the server for each request, so changing them only needs a restart, not a rebuild.
3. **Migrate before starting the new version:** `npm run db:migrate`. Migrations are additive and apply in order.
4. **Build and start:** `npm ci && npm run next:build && npm run next:start`. Run it behind HTTPS: in production the session
   cookie is `Secure` and `SameSite=Strict`.
5. **Smoke test** (below).

## Health checks and monitoring

The app has no dedicated `/health` endpoint. Use these checks:

| Check                | Command                                                                                                                                                                                             | Healthy                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| App + Postgres       | `curl -s -o /dev/null -w '%{http_code}' -X POST $APP/api/parcels/lookup -H 'content-type: application/json' -d '{"trackingId":"0000000000000000000000000000000000000000000000000000000000000000"}'` | `404` (the database answered). A `500` means Postgres is unreachable |
| Mirror node          | `curl -s -o /dev/null -w '%{http_code}' $MIRROR_NODE_URL/api/v1/topics/$HCS_TOPIC_ID`                                                                                                               | `200`                                                                |
| **Ledger integrity** | `npm run verify` (all parcels + a full topic scan)                                                                                                                                                  | exit code `0`                                                        |

Run `npm run verify` on a schedule, for example hourly. It recomputes every cached update from Postgres and compares it with
the ledger:

| Exit code | Meaning                                                               | Action                            |
| --------- | --------------------------------------------------------------------- | --------------------------------- |
| `0`       | Everything verified                                                   | none                              |
| `1`       | **Tampering**: a cached update or parcel no longer matches its anchor | Page the owner (see _Escalation_) |
| `2`       | Incomplete (mirror node unreachable)                                  | Warn; re-run later                |

It also reports envelopes that are on the ledger but not in Postgres (`uncached`), and anything on the topic that isn't
an envelope. Use `-- --skip-scan` on very busy topics.

## Common issues

| Symptom                                                                    | Cause                                                                                                        | Fix                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relation "pending_submissions" does not exist`                            | A migration has not been applied                                                                             | `npm run db:migrate`                                                                                                                                                                                                          |
| `duplicate key … cargo_events_hcs_sequence_number_key` on finalize         | Postgres holds rows from a **previous topic**; sequence numbers restart at 1 on a new topic                  | Clear old rows: `TRUNCATE cargo_events, parcels;`. Keep `pending_submissions`. Then click **Refresh** on the approval. Finalizing can be retried: the approved message is on the ledger and the staged row is still `pending` |
| Proposals fail with `SERVER_MISCONFIGURED`                                 | The topic's on-chain keys don't match `HCS_*_PUBLIC_KEYS`, **or the operator key is one of the submit keys** | Correct `.env` to match the topic. If the operator is a submit key, use a separate operator account and create a new topic                                                                                                    |
| Only one approval needed / a staff member's **Approve** button is disabled | The operator key is a submit key, so it signed every schedule automatically. Blocked for new topics          | As above                                                                                                                                                                                                                      |
| Sign-in: "This wallet is not allowed to approve changes."                  | The wallet account's key isn't in the topic's submit key                                                     | Create a new topic that includes it (`npm run topic:create`). Changing an existing topic's submit key needs a topic update signed with the admin key; there is no script for that yet                                         |
| Sign-in: "account was not found yet"                                       | A brand-new account isn't on the mirror node yet                                                             | Wait a minute and retry                                                                                                                                                                                                       |
| An approval shows "Checking…" for a few seconds                            | The mirror node hasn't indexed a new schedule yet                                                            | Normal; it retries automatically                                                                                                                                                                                              |
| Proposal "Expired"                                                         | Not enough approvals within `HCS_APPROVAL_WINDOW_HOURS`                                                      | Propose again                                                                                                                                                                                                                 |
| Proposal "Rejected"                                                        | The staged details no longer matched the scheduled message, or execution failed on-chain                     | Investigate: rejected content is never shown to customers                                                                                                                                                                     |
| Customer page: "Warning: some details were changed…"                       | Postgres content was edited after it was anchored                                                            | Treat as a security incident (see _Escalation_)                                                                                                                                                                               |
| Dev server returns `500` on every page after `.next/` was deleted          | The build cache was removed while `next dev` was running                                                     | Restart `npm run next:dev`                                                                                                                                                                                                    |

## Rollback

- **Application:** redeploy the previous build, then check that it matches the current schema. Builds from before the
  wallet-approval change expect endpoints and environment variables that no longer exist, so roll the schema back too if
  you go that far.
- **Database schema:** `npm run db:migrate -- --down` rolls back the latest migration. Rolling back
  `pending-submissions` **deletes staged proposals**, so let open approvals finish or expire first.
- **Ledger:** HCS messages are permanent. A wrong update can't be removed; publish a correcting update instead.
- **Data:** restore Postgres from backup. `npm run verify` then shows whether the restored content still matches the ledger.

## Escalation

| Severity | Trigger                                                                       | Who                                                                         |
| -------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Critical | `npm run verify` exit `1`, or a customer reports a "changed" warning          | Service owner, then security. Preserve the database snapshot before any fix |
| High     | Staff can't propose or finalize (`SERVER_MISCONFIGURED`, `SUBMISSION_FAILED`) | Service owner                                                               |
| Low      | Mirror node unavailable, verification "Not checked"                           | On-call; usually clears on its own                                          |

Fill in the names and on-call channels for your organisation here.
