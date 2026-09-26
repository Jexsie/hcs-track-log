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
npm run keys:generate       # dev only: prints submitter key lines to paste into .env
docker compose up -d        # start Postgres
npm run db:migrate          # create tables
npm run topic:create        # create the multi-sig HCS topic; put the id in HCS_TOPIC_ID
npm run next:dev            # http://localhost:3000
```

## Environment variables

All variables live in `.env` at the repository root. `.env.example` holds placeholders only.
**Never commit `.env`.**

| Variable                 | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `HEDERA_NETWORK`         | `testnet`, `previewnet` or `mainnet`                          |
| `HEDERA_OPERATOR_ID`     | Account that pays fees and creates the topic                  |
| `HEDERA_OPERATOR_KEY`    | Operator private key                                          |
| `HCS_TOPIC_ID`           | Topic that receives event envelopes                           |
| `HCS_SUBMIT_PUBLIC_KEYS` | Comma-separated public keys of authorized submitters          |
| `HCS_SUBMIT_THRESHOLD`   | Signatures required per message                               |
| `HCS_SUBMIT_SIGNER_KEYS` | Private keys this server signs with (must meet the threshold) |
| `MIRROR_NODE_URL`        | Mirror node base URL used for verification                    |
| `DATABASE_URL`           | Postgres connection string                                    |

## Architecture

```
packages/nextjs    Next.js App Router app: UI, API routes, domain logic, scripts
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

### Why recompute?

Postgres has no hash column that verification relies on. Every hash is recomputed from content
through the same canonical builder used at submit time. If someone edits a row (for example an
event's `location`), the recomputed hash no longer matches the on-chain `payloadHash`, and the
UI flags that event as **tampered**. Checking a stored hash against the chain would prove
nothing about the content.

### Configuring the multi-signature submit key

The topic's **submit key** is a threshold `KeyList`. Hedera rejects any message that lacks
enough valid signatures (`INVALID_SIGNATURE`), so the network enforces this, not the app.

1. **Collect submitter public keys.** Each authorized party generates its own keypair and shares
   only the public key. For local development, `npm run keys:generate -- --count 3 --threshold 2`
   prints a ready-made set.
2. **Configure `.env`:**
   - `HCS_SUBMIT_PUBLIC_KEYS`: every authorized public key, comma-separated (DER, or `0x`-hex ECDSA).
   - `HCS_SUBMIT_THRESHOLD`: signatures required per message. At least 2 and at most the number of
     keys. A threshold of 1 is refused, because it would not be multi-signature.
   - `HCS_SUBMIT_SIGNER_KEYS`: the private keys this server co-signs with. At startup the server
     checks they meet the threshold, before any fee is paid, and refuses to start otherwise.
3. **Create the topic:** `npm run topic:create`. This builds the `KeyList`, creates the topic, and
   then reads the topic back with `TopicInfoQuery` to confirm that the on-chain submit key matches.
   Put the printed id in `HCS_TOPIC_ID`.

The topic is created **without an admin key**, so it is immutable and no single party can replace
the submit key later. To rotate signers, create a new topic.

> **Deployment note.** If one server holds `threshold` private keys, that server is effectively
> one party. For real separation of duties, keep the keys with different parties and collect their
> signatures on each frozen `TopicMessageSubmitTransaction`. See
> `lib/hedera/hcs-submitter.ts#prepare` for where to split signing out.

To prove enforcement against the live network (this costs a few testnet cents):

```bash
RUN_TESTNET_TESTS=1 npm run test
```

This creates a 2-of-3 topic and checks that a message signed by one submitter is rejected with
`INVALID_SIGNATURE` while a message signed by two is accepted.

### Write-path failure modes

| Failure                                     | Ledger   | Postgres | Error                                                                                      |
| ------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------ |
| Invalid input, unknown or duplicate parcel  | nothing  | nothing  | `ValidationError` / `ParcelNotFoundError` / `ParcelExistsError`                            |
| Submission rejected or network error        | nothing  | nothing  | `SubmissionFailedError`                                                                    |
| Consensus OK, then the database write fails | anchored | missing  | `DerivedWriteError` (carries the sequence number and content so the insert can be retried) |

A parcel is written to Postgres together with its first event, and only after that event reaches
consensus. Every cached parcel is therefore anchored on the ledger. `createdAt` is always assigned
by the server, at whole-second precision.

### `payer_account_id`

`cargo_events.payer_account_id` is a convenience copy only. It is **not** covered by
`payloadHash`. The mirror node's transaction record is the authoritative payer.

## Scripts

| Command                 | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `npm run next:dev`      | Start the dev server                                       |
| `npm run next:build`    | Production build                                           |
| `npm run lint`          | ESLint + TypeScript type-check                             |
| `npm run test`          | Vitest suite                                               |
| `npm run format`        | Prettier                                                   |
| `npm run keys:generate` | Generate dev submitter keypairs and print the `.env` lines |
| `npm run topic:create`  | Create the HCS topic with the threshold submit key         |

## License

[MIT](./LICENSE)
