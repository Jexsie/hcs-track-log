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
npm run next:dev            # http://localhost:3000 (public) and /admin (administrators)
```

For the administrator console you also need:

1. **A WalletConnect project ID.** Create one at [dashboard.reown.com](https://dashboard.reown.com)
   and set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
2. **`ADMIN_SESSION_SECRET`:** a long random string, for example from `openssl rand -hex 32`.
3. **Submit keys that belong to real wallets.** `HCS_SUBMIT_PUBLIC_KEYS` must be the public keys of
   the administrators' Hedera wallet accounts (for example in HashPack, Kabila or Blade), because
   those wallets approve every submission. See [Configuring the threshold keys](#configuring-the-threshold-keys).

## Environment variables

All variables live in `.env` at the repository root. `.env.example` holds placeholders only.
**Never commit `.env`.**

| Variable                               | Purpose                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `HEDERA_NETWORK`                       | `testnet`, `previewnet` or `mainnet`                                                                   |
| `HEDERA_OPERATOR_ID`                   | Account that pays for topic creation and for schedules. It is **not** a submit key                     |
| `HEDERA_OPERATOR_KEY`                  | Operator private key                                                                                   |
| `HCS_TOPIC_ID`                         | Topic that receives event envelopes                                                                    |
| `HCS_SUBMIT_PUBLIC_KEYS`               | Comma-separated public keys of the administrators' **wallet accounts**                                 |
| `HCS_SUBMIT_THRESHOLD`                 | Wallet approvals required per message (2..N)                                                           |
| `HCS_SUBMIT_SIGNER_KEYS`               | **Dev only:** private keys used by `npm run db:seed` to sign directly. The web server never reads them |
| `HCS_ADMIN_PUBLIC_KEYS`                | Comma-separated public keys of topic administrators                                                    |
| `HCS_ADMIN_THRESHOLD`                  | Admin signatures required to create, update or delete the topic                                        |
| `HCS_ADMIN_SIGNER_KEYS`                | Admin private keys used **only** by `npm run topic:create`                                             |
| `HCS_APPROVAL_WINDOW_HOURS`            | How long a proposal waits for approvals (default 24, max 1488 = 62 days)                               |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project ID for the admin console                                                   |
| `ADMIN_SESSION_SECRET`                 | HMAC key for sign-in challenges and admin session cookies (≥ 32 chars)                                 |
| `MIRROR_NODE_URL`                      | Mirror node base URL (default: the public one for `HEDERA_NETWORK`)                                    |
| `DATABASE_URL`                         | Postgres connection string                                                                             |
| `TEST_DATABASE_URL`                    | Test database; **its schema is dropped** on every `npm run test`. The name must end in `_test`         |

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
   Events are listed latest first (by HCS sequence number), and each row shows its `hcs_sequence_number`.
   - **Lookup is exact.** The ID must match character for character. Only surrounding whitespace
     from a paste is trimmed. Upper case, a `0x` prefix, a partial ID or SQL wildcards find nothing,
     and every miss gets the same "no parcel" answer. The query is an equality match on the
     `parcel_hash` unique index.
   - Because the ID is not in the URL, reloading the page clears the result and nothing can be bookmarked or shared by link. Search again instead.
2. An animated **"Checking records…"** overlay appears while **your browser**
   checks each event. Public mirror nodes allow cross-origin requests, so the check does not
   depend on trusting this app's server. For each event, the browser:
   - rebuilds the canonical bytes from the displayed content and computes SHA-256 fresh
     (WebCrypto),
   - fetches `GET {MIRROR_NODE_URL}/api/v1/topics/{topicId}/messages/{sequenceNumber}`,
   - requires the on-chain `parcelHash` to equal the searched ID, and the on-chain `payloadHash` to
     equal the recomputed hash.
3. The browser also recomputes the tracking ID from the parcel details.
4. Each event then shows one of:
   - a **Verified** badge, linking to that record on HashScan (the public explorer),
   - a **Changed** badge with a plain-language warning. The internal reason codes are
     `content-mismatch`, `wrong-parcel`, `invalid-content`, `not-an-envelope` and `no-anchor`.
   - **Not checked**, with a retry button, when the ledger could not be reached.

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

### Administrator console (wallet approvals)

Administrators use **`/admin`**, which has a violet theme so it can't be mistaken for the public
tracker. **This server never signs a topic message.** Every submission is a Hedera _scheduled
transaction_ that the network executes only once the topic's threshold of submit-key holders have
approved it from their own wallets.

```
admin A: connect wallet → sign in (sign challenge) → propose ─┐
                                                              ▼
                     server: validate → hash → ScheduleCreate(TopicMessageSubmit(envelope))
                             (operator pays; content staged in pending_submissions)
                                                              │
admin A, B, …: /admin/approvals → browser checks the schedule vs. content → ScheduleSign in wallet
                                                              │  threshold reached
                                                              ▼
                     network executes the topic message ──► finalize: mirror shows it and it
                                                                matches → parcels / cargo_events
```

1. **Connect and sign in.** Connect a Hedera wallet over WalletConnect (scan the QR code or paste
   the pairing link). **Sign in** asks the wallet to sign a one-time challenge (HIP-820
   `hedera_signMessage`). The server checks three things:
   - the challenge is its own and less than five minutes old,
   - the signature is by the account's _current_ key, which it looks up on the mirror node,
   - that key is one of the topic's submit keys, read from the topic on-chain.

   It then sets an 8-hour, HttpOnly, `SameSite=Strict` session cookie.

2. **Propose.** Use `/admin/parcels/new` for a new parcel with its first event, or
   `/admin/events/new` for a status update to an existing parcel (enter its exact tracking ID).
   The server validates, computes the hashes, and creates the schedule on Hedera. The schedule
   memo is only `hcs-track-log approval <uuid>`, so no business data goes on-chain. The content is
   stored in the `pending_submissions` staging table. **Nothing is written to `parcels` or
   `cargo_events` yet**, and the public tracker cannot see it.
3. **Approve.** Any signed-in administrator opens `/admin/approvals`. Before the **Approve** button
   is enabled, their browser:
   - fetches the schedule and the topic's submit key from the mirror node,
   - recomputes the envelope from the content on screen and checks it byte-for-byte against the
     scheduled message,
   - shows the approval count against the on-chain threshold.

   The proposer's own approval counts first. Right after proposing, the console asks the proposer's
   wallet to approve, once the check above has passed. Another administrator's approval then
   completes a 2-of-N key.

   **Approve** builds a `ScheduleSign` in the browser and sends it to the wallet
   (`hedera_signAndExecuteTransaction`). The wallet shows it, signs it, pays a small fee, and
   submits it.

4. **Execute and finalize.** When the threshold is reached, the network executes the topic
   message. The console then calls `finalize`, which:
   - finds the executed message on the mirror node,
   - checks it against an envelope recomputed from the staged content,
   - only then writes the parcel and event to the read cache and marks the submission executed, in
     one transaction.

   If staged content doesn't match the chain, it is marked `rejected` and never cached. Proposals
   not approved within `HCS_APPROVAL_WINDOW_HOURS` expire.

On testnet and previewnet, both forms have a **Fill sample data** button that fills them with random, valid demo data. It never appears on mainnet. Form validation uses the same normalizers as the server. Event times are entered in local time and
converted to canonical UTC.

### Why recompute?

Postgres has no hash column that verification relies on. Every hash is recomputed from content
through the same canonical builder used at submit time. If someone edits a row (for example an
event's `location`), the recomputed hash no longer matches the on-chain `payloadHash`, and the
UI flags that event as **tampered**. Checking a stored hash against the chain would prove
nothing about the content.

### Configuring the threshold keys

The topic has **two threshold keys** (`KeyList`s). Hedera itself rejects any transaction without
enough valid signatures (`INVALID_SIGNATURE`), so the network enforces them, not the app.

| Key            | Gates                                                                          | Who holds the private keys                                                     |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Submit key** | Every message submitted to the topic                                           | The administrators' **wallets**, which approve each submission                 |
| **Admin key**  | Creating, updating or deleting the topic (for example rotating the submit key) | Topic administrators; only `npm run topic:create` uses `HCS_ADMIN_SIGNER_KEYS` |

1. **Collect public keys.** Each administrator shares the public key of their Hedera wallet account.
   Only accounts with a single ED25519 or ECDSA key can sign in. For local testing,
   `npm run keys:generate -- --submit 2/3 --admin 2/3` prints throwaway key sets.
2. **Configure `.env`:**
   - For each role (`HCS_SUBMIT_*` and `HCS_ADMIN_*`), set `*_PUBLIC_KEYS` (comma-separated, DER
     or `0x`-hex ECDSA) and `*_THRESHOLD`.
   - Each threshold must be at least 2 and at most the number of keys. A threshold of 1 is refused,
     because it would not be multi-signature.
   - `HCS_ADMIN_SIGNER_KEYS` is needed only when creating the topic, because Hedera requires the new
     admin key to sign the creation. Remove it from the server's `.env` afterwards.
3. **Create the topic:** `npm run topic:create`. This co-signs the creation with enough admin keys,
   then reads the topic back with `TopicInfoQuery` to confirm that both keys match on-chain. Put
   the printed id in `HCS_TOPIC_ID`.

Before it creates its first schedule, the server repeats that on-chain check using the admin and
submit **public** keys. If the topic's keys were ever changed, it refuses to propose and returns
`SERVER_MISCONFIGURED`. The server's operator account only pays for schedules. **Its key must not be a submit key.**
Hedera counts the payer's signature on a `ScheduleCreate` toward the scheduled transaction, so an
operator that held a submit key would silently give one approval to every proposal. `topic:create`
and the server both refuse that configuration, so use an operator account that is not an
administrator's wallet.

To prove enforcement against the live network (this costs a few testnet cents):

```bash
RUN_TESTNET_TESTS=1 npm run test
```

This runs two live test suites.

The first creates a topic with 2-of-3 submit and admin keys and checks each case:

| Action           | Signed by one party               | Signed by two parties |
| ---------------- | --------------------------------- | --------------------- |
| Submit a message | rejected with `INVALID_SIGNATURE` | accepted              |
| Update the topic | rejected with `INVALID_SIGNATURE` | accepted              |

The second runs the full approval flow: it proposes a submission, checks that one `ScheduleSign`
does not execute it, adds a second approval from an ECDSA key, and then finalizes and verifies the
result from the real mirror node.

### Write-path failure modes

| Failure                                    | Ledger              | Staging    | Read cache        | Result                                          |
| ------------------------------------------ | ------------------- | ---------- | ----------------- | ----------------------------------------------- |
| Invalid input, unknown or duplicate parcel | nothing             | nothing    | nothing           | `400` / `404` / `409`                           |
| Hedera refuses the schedule                | nothing             | nothing    | nothing           | `502 SUBMISSION_FAILED`                         |
| Not enough approvals before expiry         | schedule expires    | `expired`  | nothing           | proposal closed                                 |
| Staged content altered after proposal      | message may execute | `rejected` | **never written** | flagged, not cached                             |
| Executed, mirror node not caught up yet    | anchored            | `pending`  | not yet           | `finalize` reports `awaitingMirror` and retries |
| Mirror node unreachable                    | unchanged           | unchanged  | unchanged         | `503 LEDGER_UNAVAILABLE`                        |

A parcel reaches the read cache together with its first event, and only after that event's topic
message has executed. Every cached parcel is therefore anchored on the ledger. `createdAt` is always
assigned by the server, at whole-second precision.

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

### Administrator API

All endpoints take and return JSON. The browser console is the only intended client. Every endpoint
except the two sign-in steps requires the session cookie. State-changing requests must be
`application/json`, which together with `SameSite=Strict` blocks cross-site form posts. No
identifier ever appears in a URL.

| Endpoint                                 | Body                                                                                               | Result                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /api/admin/auth/challenge`         | `{ accountId }`                                                                                    | `{ message, token }`: the text to sign in the wallet                                        |
| `POST /api/admin/auth/session`           | `{ accountId, token, signatureMap }`                                                               | sets the session cookie; `403 NOT_A_SUBMITTER` if the key is not a submit key               |
| `GET` / `DELETE /api/admin/auth/session` | none                                                                                               | current admin / sign out                                                                    |
| `GET /api/admin/submissions`             | none                                                                                               | `{ submissions }` still awaiting approval                                                   |
| `POST /api/admin/submissions`            | `{ kind: "register-parcel", parcel, firstEvent }` or `{ kind: "record-event", parcelHash, event }` | `201 { submission }` with `scheduleId`                                                      |
| `POST /api/admin/submissions/finalize`   | `{ id }`                                                                                           | `pending` (with approvals) / `executed` (with `hcsSequenceNumber`) / `expired` / `rejected` |

Errors use the shape `{ error: { code, message, path? } }`. Timestamps must include a UTC offset
and have whole-second precision.

### `payer_account_id`

`cargo_events.payer_account_id` is a convenience copy only. It is **not** covered by
`payloadHash`. The mirror node's transaction record is the authoritative payer.

### Branding

The app is dressed as **Kivu Cargo**, a fictional freight company. Customers track shipments on the
public page, and Kivu Cargo staff book shipments and post updates in the **staff portal**
(`/admin`). To rebrand it for your own company, edit `packages/nextjs/lib/brand.ts`: the name,
portal label, booking-reference prefix and the company's own carrier. The logo is in
`app/components/brand-mark.tsx`.

### UI wording

The interface uses plain cargo language: shipments, updates, tracking ID, shipper, consignee and
carrier. It avoids ledger terms. Hedera is named once, on the home page, as the source of truth, and
no emojis are used. Keep new copy consistent with this.

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
