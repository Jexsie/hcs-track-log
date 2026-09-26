# hcs-track-log

A public cargo & package tracker on Hedera. Authorized parties record shipment events to a
**Hedera Consensus Service (HCS)** topic; anyone can search a parcel and verify every event
against the ledger.

The ledger is a tamper-evident notary log. Postgres is a fast read cache derived from it.

> **Verification recomputes the hash from content; it never trusts a stored hash.**

No Solidity, no smart contracts: HCS only, through the Hiero SDK.

## Quick start

```bash
npm create scaffold-hbar@latest -- --template Jexsie/hcs-track-log --package-manager npm
```

This template supports **npm only**.

## Prerequisites

| Requirement             | Notes                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Node.js `>=20.18.3`     | CI runs Node 22 (see `.nvmrc`)                                                       |
| npm                     | The only supported package manager                                                   |
| Docker                  | Runs the bundled Postgres via `docker-compose.yml`                                   |
| **Postgres (required)** | The app does not run without it. Use Docker or bring your own and set `DATABASE_URL` |
| Hedera account          | A testnet operator account from [portal.hedera.com](https://portal.hedera.com/)      |

## Setup

```bash
npm install
cp .env.example .env        # fill in HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY
npm run keys:generate       # dev only: prints submit + admin key lines to paste into .env
docker compose up -d        # start Postgres
npm run db:migrate          # create tables
npm run topic:create        # create the HCS topic (threshold admin + submit keys); set HCS_TOPIC_ID
npm run db:seed             # optional: anchor a demo parcel on HCS and cache it
npm run next:dev            # http://localhost:3000
```

## Environment variables

All variables live in `.env` at the repository root. `.env.example` holds placeholders only.
**Never commit `.env`.**

| Variable                 | Purpose                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `HEDERA_NETWORK`         | `testnet`, `previewnet` or `mainnet`                                                            |
| `HEDERA_OPERATOR_ID`     | Account that pays fees and creates the topic                                                    |
| `HEDERA_OPERATOR_KEY`    | Operator private key                                                                            |
| `HCS_TOPIC_ID`           | Topic that receives event envelopes                                                             |
| `HCS_SUBMIT_PUBLIC_KEYS` | Comma-separated public keys of authorized submitters                                            |
| `HCS_SUBMIT_THRESHOLD`   | Signatures required per message                                                                 |
| `HCS_SUBMIT_SIGNER_KEYS` | Private keys this server signs with (must meet the threshold)                                   |
| `HCS_ADMIN_PUBLIC_KEYS`  | Comma-separated public keys of topic administrators                                             |
| `HCS_ADMIN_THRESHOLD`    | Admin signatures required to create, update or delete the topic                                 |
| `HCS_ADMIN_SIGNER_KEYS`  | Admin private keys used **only** by `npm run topic:create`; the running server never needs them |
| `MIRROR_NODE_URL`        | Mirror node base URL used for verification                                                      |
| `DATABASE_URL`           | Postgres connection string                                                                      |
| `TEST_DATABASE_URL`      | Test database; **its schema is dropped** on every `npm run test`. The name must end in `_test`  |
| `SUBMITTER_API_TOKEN`    | Bearer token for the write API (≥ 32 chars; `openssl rand -hex 32`)                             |

## Architecture

```
packages/nextjs    Next.js App Router app (Tailwind CSS v4): UI, API routes, domain logic, scripts
```

- **Write (HCS-first):** canonicalize the event → SHA-256 → build the envelope → submit to the
  topic → _only after consensus success_ write the event to Postgres. If submission fails,
  nothing is written.
- **Read (database-first):** the timeline renders straight from Postgres.
- **Verify (recompute):** for each event, rebuild the canonical bytes from the Postgres columns,
  hash them fresh, fetch the HCS message at the event's `hcs_sequence_number` from the mirror
  node, and compare.

### The two hashes

There are exactly two hashes, over **disjoint** field sets:

| Hash          | Covers                                                                                                                                    | Lifetime                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `parcelHash`  | consignment (description, packageCount, packageType, grossMassKg, volumeCubicMeters), parties (shipper, consignee), bookingRef, createdAt | Computed once; the public tracking ID |
| `payloadHash` | status, location, carrier (name, scacCode), timestamp                                                                                     | Computed fresh for every event        |

`bookingRef` and `createdAt` stop two identical shipments from colliding into the same ID, and
make the ID impossible to guess from business data alone.

### On-chain envelope

Only blind notary fields reach the ledger:

```ts
interface HcsMessageEnvelope {
  v: number; // envelope version
  parcelHash: string; // tracking ID, constant per parcel
  payloadHash: string; // SHA-256 of this event's canonical content
}
```

No statuses, locations, carriers or descriptions go on-chain.

### Search and verify

1. Open `/` and enter a tracking ID. It is sent in a `POST /api/parcels/lookup` request **body**,
   never in the URL, so it stays out of the address bar, browser history, server access logs and
   `Referer` headers. The timeline renders in place, straight from Postgres (database-first).
   Each row shows its `hcs_sequence_number`.
   - **Lookup is exact.** The ID must match character for character. Only surrounding whitespace
     from a paste is trimmed. Upper case, a `0x` prefix, a partial ID or SQL wildcards find nothing,
     and every miss gets the same "no parcel" answer. The query is an equality match on the
     `parcel_hash` unique index.
   - Because the ID is not in the URL, reloading the page clears the result and nothing can be bookmarked or shared by link. Search again instead.
2. An animated **"Verifying live ledger integrity…"** overlay appears while **your browser**
   checks each event. Public mirror nodes allow cross-origin requests, so the check does not
   depend on trusting this app's server. For each event, the browser:
   - rebuilds the canonical bytes from the displayed content and computes SHA-256 fresh
     (WebCrypto),
   - fetches `GET {MIRROR_NODE_URL}/api/v1/topics/{topicId}/messages/{sequenceNumber}`,
   - requires the on-chain `parcelHash` to equal the searched ID, and the on-chain `payloadHash` to
     equal the recomputed hash.
3. The browser also recomputes the tracking ID from the parcel details.
4. Each event then shows one of:
   - **✅ Verified against ledger**, linking to that mirror-node message.
   - A **security warning** naming the sequence number. Reasons: `content-mismatch`,
     `wrong-parcel`, `invalid-content`, `not-an-envelope`, `no-anchor`.
   - **Ledger unreachable**, with a retry button.

Every hash on the page is recomputed; none is read from storage. `POST /api/parcels/lookup` with
`{ "trackingId": "<id>" }` returns the same stored content as JSON (`Cache-Control: no-store`), so
any client can verify it independently.

### Verify from the command line

```bash
npm run verify -- --topic 0.0.12345              # every cached parcel + a topic scan
npm run verify -- --parcel <trackingId>          # one parcel
npm run verify -- --topic 0.0.12345 --skip-scan  # skip paging through the whole topic
```

- **What it does:** recomputes every cached event from Postgres and compares it with the ledger.
  The topic scan follows mirror-node pagination, and reports envelopes that are on the ledger but
  missing from the cache (for example after a `CACHE_WRITE_FAILED`), plus any non-envelope
  messages.
- **Defaults:** `--topic` falls back to `HCS_TOPIC_ID`.
- **Exit codes:** `0` all verified, `1` tampering found, `2` incomplete (mirror node unreachable).

### Administrator console

Authorized submitters use **`/admin`**, which has a violet theme so it can't be mistaken for the
public tracker.

- **`/admin/parcels/new`:** register a parcel. Enter the consignment (description, package count
  and type, gross mass, volume), the parties, the booking reference, and the first event. The
  server assigns `createdAt`, derives the tracking ID, and anchors the event on HCS before saving
  anything.
- **`/admin/events/new`:** record a status update. Paste the exact tracking ID; the form looks the
  parcel up first, so you can confirm it is the right one. After registering a parcel,
  **Record next event** opens this form in place with the ID carried in page state, not the URL.

How the console behaves:

- **Validation:** every field is checked in the browser with the same normalizers the server uses,
  so all errors show at once. Server-side errors are mapped back to the field that caused them.
- **Event time:** entered in your local time and converted to canonical UTC (whole seconds).
- **After a successful submission**, the console shows the tracking ID (with a copy button), a
  link to the ledger message, and the exact envelope written on-chain. The envelope is recomputed
  in your browser.
- **The token:** the console calls the write API with `SUBMITTER_API_TOKEN`. You paste it once per
  tab; it is kept in `sessionStorage` and dropped when the tab closes. The pages are `noindex` and
  hold no secrets: without the token they cannot write anything.

### Why recompute?

Postgres has no hash column that verification relies on. Every hash is recomputed from content
through the same canonical builder used at submit time. If someone edits a row (for example an
event's `location`), the recomputed hash no longer matches the on-chain `payloadHash`, and the
UI flags that event as **tampered**. Checking a stored hash against the chain would prove
nothing about the content.

### Configuring the threshold keys

The topic has **two threshold keys** (`KeyList`s). Hedera itself rejects any transaction without
enough valid signatures (`INVALID_SIGNATURE`), so the network enforces them, not the app.

| Key            | Gates                                                                          | Who needs the private keys                                                        |
| -------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Submit key** | Every message submitted to the topic                                           | The server (`HCS_SUBMIT_SIGNER_KEYS`), for each event it records                  |
| **Admin key**  | Creating, updating or deleting the topic (for example rotating the submit key) | Only `npm run topic:create` and future admin operations (`HCS_ADMIN_SIGNER_KEYS`) |

1. **Collect public keys.** Each submitter and each administrator generates their own keypair and
   shares only the public key. For local development,
   `npm run keys:generate -- --submit 2/3 --admin 2/3` prints both sets.
2. **Configure `.env`:**
   - For each role (`HCS_SUBMIT_*` and `HCS_ADMIN_*`), set `*_PUBLIC_KEYS` (comma-separated, DER
     or `0x`-hex ECDSA) and `*_THRESHOLD`. The threshold must be at least 2 and at most the number
     of keys. A threshold of 1 is refused, because it would not be multi-signature.
   - `HCS_SUBMIT_SIGNER_KEYS`: the private keys this server co-signs messages with. The server
     checks they meet the submit threshold before any fee is paid, and refuses to start otherwise.
   - `HCS_ADMIN_SIGNER_KEYS`: needed only when creating the topic, because Hedera requires the new
     admin key to sign the creation. Remove them from the server's `.env` afterwards.
3. **Create the topic:** `npm run topic:create`. This co-signs the creation with enough admin keys,
   then reads the topic back with `TopicInfoQuery` to confirm that both keys match on-chain. Put
   the printed id in `HCS_TOPIC_ID`.

Before its first submission, the server repeats that on-chain check using the admin and submit
**public** keys. If the topic's keys were ever changed, it refuses to write and returns
`SERVER_MISCONFIGURED`.

> **Deployment note.** If one server holds `threshold` private keys, that server is effectively
> one party. For real separation of duties, keep the keys with different parties and collect their
> signatures on each frozen transaction. See `lib/hedera/hcs-submitter.ts#prepare` (messages) and
> `lib/hedera/create-topic.ts#prepareCreateTopicTransaction` (topic creation) for where to split
> signing out.

To prove enforcement against the live network (this costs a few testnet cents):

```bash
RUN_TESTNET_TESTS=1 npm run test
```

This creates a topic with 2-of-3 submit and admin keys, then checks each case:

| Action           | Signed by one party               | Signed by two parties |
| ---------------- | --------------------------------- | --------------------- |
| Submit a message | rejected with `INVALID_SIGNATURE` | accepted              |
| Update the topic | rejected with `INVALID_SIGNATURE` | accepted              |

### Write-path failure modes

| Failure                                     | Ledger   | Postgres | Error                                                                                      |
| ------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------ |
| Invalid input, unknown or duplicate parcel  | nothing  | nothing  | `ValidationError` / `ParcelNotFoundError` / `ParcelExistsError`                            |
| Submission rejected or network error        | nothing  | nothing  | `SubmissionFailedError`                                                                    |
| Consensus OK, then the database write fails | anchored | missing  | `DerivedWriteError` (carries the sequence number and content so the insert can be retried) |

A parcel is written to Postgres together with its first event, and only after that event reaches
consensus. Every cached parcel is therefore anchored on the ledger. `createdAt` is always assigned
by the server, at whole-second precision.

### Database

**Postgres is required.** `docker compose up -d` starts Postgres 18 with two databases,
`hcs_track_log` (the app) and `hcs_track_log_test` (the test suite). Migrations live in
`packages/nextjs/migrations` as plain SQL and are run by `npm run db:migrate`. To roll back the
latest migration, run `npm run db:migrate -- --down`.

| Table          | Columns                                                                                                                                                                                                      | Notes                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `parcels`      | `id`, `parcel_hash` (unique), description, package_count, package_type, gross_mass_kg `NUMERIC(10,2)`, volume_cubic_meters `NUMERIC(10,2)`, shipper, consignee, booking_ref, created_at `TIMESTAMPTZ(0)`     | Immutable parcel content   |
| `cargo_events` | `id`, `parcel_hash` → parcels `ON DELETE CASCADE`, status, location, carrier_name, carrier_scac_code, event_timestamp `TIMESTAMPTZ(0)`, payer_account_id, hcs_sequence_number `BIGINT` (unique), recorded_at | One row per anchored event |

- **No stored payload hash.** `parcel_hash` is only the lookup key. Verification recomputes both
  hashes from the content columns.
- **Round-trip safety.** `NUMERIC(10,2)` comes back from `pg` as a fixed-scale string (`"142.50"`)
  and `TIMESTAMPTZ(0)` as an instant, so the canonical builder rebuilds identical bytes. The test
  suite proves this under four different session time zones.
- **One topic per database.** `hcs_sequence_number` is unique across the table, which matches one
  topic per deployment.

### Write API

Both endpoints require `Authorization: Bearer $SUBMITTER_API_TOKEN`. The server co-signs
submissions, so an open write endpoint would let anyone write to the topic through it.

| Endpoint            | Body                                                                                                     | Success                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `POST /api/parcels` | `{ parcel: { consignment, parties, bookingRef }, firstEvent: { status, location, carrier, timestamp } }` | `201 { parcelHash, firstEvent: { hcsSequenceNumber, payerAccountId } }` |
| `POST /api/events`  | `{ parcelHash, event: { status, location, carrier: { name, scacCode }, timestamp } }`                    | `201 { parcelHash, hcsSequenceNumber }`                                 |

Errors use the shape `{ error: { code, message, path? } }`. The codes are:

| HTTP status | Code                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| 400         | `VALIDATION_ERROR`                                                                                               |
| 401         | `UNAUTHORIZED`                                                                                                   |
| 404         | `PARCEL_NOT_FOUND`                                                                                               |
| 409         | `PARCEL_EXISTS`                                                                                                  |
| 502         | `SUBMISSION_FAILED` (nothing recorded)                                                                           |
| 500         | `SERVER_MISCONFIGURED`                                                                                           |
| 500         | `CACHE_WRITE_FAILED` (anchored at `hcsSequenceNumber`; the full content is written to the server log for replay) |

Timestamps must include a UTC offset and have whole-second precision.

### `payer_account_id`

`cargo_events.payer_account_id` is a convenience copy only. It is **not** covered by
`payloadHash`. The mirror node's transaction record is the authoritative payer.

## Scripts

| Command                 | Purpose                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run next:dev`      | Start the dev server                                                                            |
| `npm run next:build`    | Production build                                                                                |
| `npm run lint`          | ESLint + TypeScript type-check                                                                  |
| `npm run test`          | Vitest: `unit` project + `db` project (needs Postgres)                                          |
| `npm run format`        | Prettier                                                                                        |
| `npm run keys:generate` | Generate dev submit + admin keypairs and print the `.env` lines (`-- --submit 2/3 --admin 2/3`) |
| `npm run topic:create`  | Create the HCS topic with threshold admin and submit keys                                       |
| `npm run db:migrate`    | Apply migrations (`-- --down` rolls back the latest)                                            |
| `npm run db:seed`       | Anchor a demo parcel and its journey on HCS, then cache it                                      |
| `npm run verify`        | Verify cached events against the topic by recomputation (`-- --topic <id>`)                     |

## License

[MIT](./LICENSE)
