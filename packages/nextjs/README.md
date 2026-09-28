# Kivu Cargo — Demo Shipment Tracker

The demo app for the [hcs-track-log template](../../README.md). Kivu Cargo is a fictional freight
company:

- **Customers** track a shipment at `/` and see every update checked against Hedera.
- **Staff** book shipments and post updates in the staff portal at `/admin`. Each change goes on
  the ledger only after several staff wallets approve it.

Shipment details live in Postgres. The ledger holds only hashes. Setup and environment variables
are in the [root README](../../README.md#quick-start).

## Pages

| Page                 | Who       | What it does                                                    |
| -------------------- | --------- | --------------------------------------------------------------- |
| `/`                  | Customers | Enter a tracking ID, see the timeline and each update's verdict |
| `/admin`             | Staff     | Connect a wallet, sign in, start here                           |
| `/admin/parcels/new` | Staff     | Book a shipment together with its first update                  |
| `/admin/events/new`  | Staff     | Post an update to an existing shipment                          |
| `/admin/approvals`   | Staff     | Check and approve changes waiting for signatures                |

## Data model

### The two hashes

There are exactly two hashes, over **disjoint** field sets:

| Hash          | Covers                                                                                                                                    | Lifetime                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `parcelHash`  | consignment (description, packageCount, packageType, grossMassKg, volumeCubicMeters), parties (shipper, consignee), bookingRef, createdAt | Computed once; the public tracking ID |
| `payloadHash` | status, location, carrier (name, scacCode), timestamp                                                                                     | Computed fresh for every update       |

`bookingRef` and `createdAt` stop two identical shipments from colliding into the same ID, and
make the ID impossible to guess from business data alone. The server always assigns `createdAt`,
at whole-second precision.

### On-chain envelope

```ts
interface HcsMessageEnvelope {
  v: number; // envelope version
  parcelHash: string; // tracking ID, constant per parcel
  payloadHash: string; // SHA-256 of this update's canonical content
}
```

No statuses, locations, carriers or descriptions go on-chain.

### Database

`docker compose up -d` starts Postgres 18 with two databases, `hcs_track_log` (the app) and
`hcs_track_log_test` (the test suite). Migrations are plain SQL in `migrations/`.

| Table                 | Holds                                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| `parcels`             | Immutable shipment details; `parcel_hash` (unique) is the lookup key           |
| `cargo_events`        | One row per anchored update, with its `hcs_sequence_number` (unique)           |
| `pending_submissions` | Proposals waiting for wallet approvals. The tracker and verifier never read it |

- **No stored payload hash.** Verification recomputes both hashes from the content columns.
- **Round-trip safety.** `NUMERIC(10,2)` comes back from `pg` as a fixed-scale string (`"142.50"`)
  and `TIMESTAMPTZ(0)` as an instant, so the canonical builder rebuilds identical bytes. The tests
  prove this under four session time zones.
- **One topic per database.** `hcs_sequence_number` is unique across the table.
- **`payer_account_id`** is a convenience copy, not covered by `payloadHash`. The mirror node's
  transaction record is the authoritative payer.

## Tracking and verifying a shipment

1. The customer enters a tracking ID at `/`. It travels in a `POST /api/parcels/lookup` request
   **body**, never the URL, so it stays out of browser history, access logs and `Referer` headers.
   The timeline renders straight from Postgres, latest update first.
   - **Lookup is exact.** Only surrounding whitespace is trimmed. Upper case, a `0x` prefix or a
     partial ID find nothing, and every miss gets the same "no parcel" answer.
   - Reloading the page clears the result; there is no shareable link.
2. **The customer's browser** then checks each update. Public mirror nodes allow cross-origin
   requests, so this doesn't depend on trusting the app's server. For each update it:
   - rebuilds the canonical bytes from the displayed content and hashes them (WebCrypto),
   - fetches `GET {MIRROR_NODE_URL}/api/v1/topics/{topicId}/messages/{sequenceNumber}`,
   - requires the on-chain `parcelHash` to equal the searched ID and the on-chain `payloadHash` to
     equal the recomputed hash.
3. It also recomputes the tracking ID from the shipment details.
4. Each update shows **Verified** (linked to HashScan), **Changed** (with a plain-language
   warning), or **Not checked** with a retry button if the ledger was unreachable. The internal
   reason codes are `content-mismatch`, `wrong-parcel`, `invalid-content`, `not-an-envelope` and
   `no-anchor`.

The browser checks only the updates Postgres returns. An update deleted from the database is caught
by `npm run verify`, which scans the whole topic and reports anchors with no cached row.

### From the command line

```bash
npm run verify -- --topic 0.0.12345              # every cached parcel + a topic scan
npm run verify -- --parcel <trackingId>          # one parcel
npm run verify -- --topic 0.0.12345 --skip-scan  # skip paging through the whole topic
```

`--topic` defaults to `HCS_TOPIC_ID`. Exit codes: `0` all verified, `1` tampering found, `2`
incomplete (mirror node unreachable).

## Staff portal: wallet approvals

**The server never signs a topic message.** Every change is a Hedera scheduled transaction that the
network executes only once enough submit-key holders approve it from their own wallets.

```
staff A: connect wallet → sign in (sign challenge) → propose ─┐
                                                              ▼
                     server: validate → hash → ScheduleCreate(TopicMessageSubmit(envelope))
                             (operator pays; content staged in pending_submissions)
                                                              │
staff A, B, …: /admin/approvals → browser checks schedule vs. content → ScheduleSign in wallet
                                                              │  threshold reached
                                                              ▼
                     network executes the topic message ──► finalize: mirror shows it and it
                                                                matches → parcels / cargo_events
```

1. **Sign in.** Connect a wallet over WalletConnect and sign a one-time challenge (HIP-820
   `hedera_signMessage`). The server checks that the challenge is its own and under five minutes
   old, that the signature is by the account's current key (read from the mirror node), and that
   the key is one of the topic's submit keys (read from the topic on-chain). It then sets an 8-hour,
   HttpOnly, `SameSite=Strict` session cookie.
2. **Propose.** The server validates the form, computes the hashes and creates the schedule. The
   schedule memo is only `hcs-track-log approval <uuid>`. The content goes to
   `pending_submissions`; customers can't see it yet.
3. **Approve.** Before **Approve** is enabled, the approver's browser fetches the schedule and the
   topic's submit key, recomputes the envelope from the content on screen, checks it byte-for-byte
   against the scheduled message, and shows the approval count. The proposer's wallet is asked to
   approve first; another staff member's approval completes a 2-of-N key.
4. **Finalize.** Once the network executes the message, `finalize` finds it on the mirror node,
   checks it against the staged content, and writes the parcel and update to Postgres in one
   transaction. Content that doesn't match is marked `rejected` and never cached. Proposals not
   approved within `HCS_APPROVAL_WINDOW_HOURS` expire.

On testnet and previewnet, both forms have a **Fill sample data** button. It never appears on
mainnet.

### Configuring the threshold keys

The topic has **two threshold keys**, enforced by the Hedera network itself (`INVALID_SIGNATURE`):

| Key            | Gates                          | Who holds the private keys                                                     |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| **Submit key** | Every message on the topic     | Staff **wallets**, which approve each change                                   |
| **Admin key**  | Updating or deleting the topic | Topic administrators; only `npm run topic:create` uses `HCS_ADMIN_SIGNER_KEYS` |

1. **Collect public keys.** Each staff member shares their wallet account's public key. Only
   accounts with a single ED25519 or ECDSA key can sign in. For local testing,
   `npm run keys:generate -- --submit 2/3 --admin 2/3` prints throwaway key sets.
2. **Configure `.env`.** For `HCS_SUBMIT_*` and `HCS_ADMIN_*`, set `*_PUBLIC_KEYS` (comma-separated,
   DER or `0x`-hex) and `*_THRESHOLD` (at least 2, at most the number of keys).
   `HCS_ADMIN_SIGNER_KEYS` is only needed to create the topic; remove it from the server afterwards.
3. **Create the topic** with `npm run topic:create`. It co-signs with enough admin keys, reads the
   topic back to confirm both keys, and prints the id for `HCS_TOPIC_ID`.

The server repeats that check before its first schedule and refuses to propose
(`SERVER_MISCONFIGURED`) if the keys changed. **The operator account must not be a submit key.**
Hedera counts the payer's signature on a `ScheduleCreate` toward the scheduled transaction, so an
operator holding a submit key would silently approve every proposal. `topic:create` and the server
both refuse that setup.

To prove enforcement on the live network (a few testnet cents): `RUN_TESTNET_TESTS=1 npm run test`.
One suite shows a single signature is rejected and two are accepted, for both keys. The other runs
the full propose → approve → finalize flow against the real mirror node.

### Write-path failure modes

| Failure                                    | Ledger              | Staging    | Read cache        | Result                                          |
| ------------------------------------------ | ------------------- | ---------- | ----------------- | ----------------------------------------------- |
| Invalid input, unknown or duplicate parcel | nothing             | nothing    | nothing           | `400` / `404` / `409`                           |
| Hedera refuses the schedule                | nothing             | nothing    | nothing           | `502 SUBMISSION_FAILED`                         |
| Not enough approvals before expiry         | schedule expires    | `expired`  | nothing           | proposal closed                                 |
| Staged content altered after proposal      | message may execute | `rejected` | **never written** | flagged, not cached                             |
| Executed, mirror node not caught up yet    | anchored            | `pending`  | not yet           | `finalize` reports `awaitingMirror` and retries |
| Mirror node unreachable                    | unchanged           | unchanged  | unchanged         | `503 LEDGER_UNAVAILABLE`                        |

## API

All endpoints take and return JSON, and no identifier ever appears in a URL. Staff endpoints need
the session cookie, except the two sign-in steps. State-changing requests must be
`application/json`, which together with `SameSite=Strict` blocks cross-site form posts.

| Endpoint                                 | Body                                                                                               | Result                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /api/parcels/lookup`               | `{ trackingId }`                                                                                   | the stored parcel and updates (`Cache-Control: no-store`), or `404`                         |
| `POST /api/admin/auth/challenge`         | `{ accountId }`                                                                                    | `{ message, token }`: the text to sign in the wallet                                        |
| `POST /api/admin/auth/session`           | `{ accountId, token, signatureMap }`                                                               | sets the session cookie; `403 NOT_A_SUBMITTER` if the key is not a submit key               |
| `GET` / `DELETE /api/admin/auth/session` | none                                                                                               | current staff member / sign out                                                             |
| `GET /api/admin/submissions`             | none                                                                                               | `{ submissions }` still awaiting approval                                                   |
| `POST /api/admin/submissions`            | `{ kind: "register-parcel", parcel, firstEvent }` or `{ kind: "record-event", parcelHash, event }` | `201 { submission }` with `scheduleId`                                                      |
| `POST /api/admin/submissions/finalize`   | `{ id }`                                                                                           | `pending` (with approvals) / `executed` (with `hcsSequenceNumber`) / `expired` / `rejected` |

Errors use the shape `{ error: { code, message, path? } }`. Timestamps must include a UTC offset
and have whole-second precision.

<!-- AUTO-GENERATED:routes (from app/api/**/route.ts; do not edit by hand) -->

| Route                             | Methods               | Access                                      | Source                                        |
| --------------------------------- | --------------------- | ------------------------------------------- | --------------------------------------------- |
| `/api/admin/auth/challenge`       | `POST`                | public                                      | `app/api/admin/auth/challenge/route.ts`       |
| `/api/admin/auth/session`         | `POST` `GET` `DELETE` | `POST` public; `GET`/`DELETE` staff session | `app/api/admin/auth/session/route.ts`         |
| `/api/admin/submissions/finalize` | `POST`                | staff session                               | `app/api/admin/submissions/finalize/route.ts` |
| `/api/admin/submissions`          | `GET` `POST`          | staff session                               | `app/api/admin/submissions/route.ts`          |
| `/api/parcels/lookup`             | `POST`                | public                                      | `app/api/parcels/lookup/route.ts`             |

<!-- /AUTO-GENERATED:routes -->

## Branding and wording

To rebrand the demo, edit `lib/brand.ts` (name, portal label, booking-reference prefix and the
company's own carrier). The logo is in `app/components/brand-mark.tsx`.

The UI uses plain cargo language: shipments, updates, tracking ID, shipper, consignee, carrier. It
avoids ledger terms, names Hedera once on the home page as the source of truth, and uses no emojis.
Keep new copy consistent with this.
