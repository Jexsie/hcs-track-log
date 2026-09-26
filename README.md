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
cp .env.example .env        # fill in operator + submitter keys
docker compose up -d        # start Postgres
npm install
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

### `payer_account_id`

`cargo_events.payer_account_id` is a convenience copy only. It is **not** covered by
`payloadHash`. The mirror node's transaction record is the authoritative payer.

## Scripts

| Command              | Purpose                        |
| -------------------- | ------------------------------ |
| `npm run next:dev`   | Start the dev server           |
| `npm run next:build` | Production build               |
| `npm run lint`       | ESLint + TypeScript type-check |
| `npm run test`       | Vitest suite                   |
| `npm run format`     | Prettier                       |

## License

[MIT](./LICENSE)
