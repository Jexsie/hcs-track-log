# hcs-track-log — Verifiable Records on HCS

A Scaffold-HBAR template for **tamper-evident records on the Hedera Consensus Service (HCS)**.
Your app keeps readable data in Postgres, anchors a SHA-256 fingerprint of every record on an HCS
topic, and lets anyone prove the data was not changed. The proof is to recompute the hash from the
content and compare it with the ledger. No smart contracts, no Solidity: HCS only, through the
Hiero SDK.

It ships with a working demo, **Kivu Cargo**, a shipment tracker where staff post parcel updates
and customers verify each one in their own browser. See the [demo README](packages/nextjs/README.md).

```bash
npm create scaffold-hbar@latest -- --template Jexsie/hcs-track-log --package-manager npm
```

## Disclaimer

This template, including its tooling and UI, is experimental and has not been audited. Do not use it
in production without your own security review.

## What the template gives you

HCS is a public, ordered, timestamped log. Every message gets a consensus timestamp and sequence
number that no one can rewrite, and messages cost a fraction of a cent. That makes it a good
**notary**: you don't put your data on-chain, you put a commitment to it there.

This template packages that pattern with the parts that are easy to get wrong:

| Capability                       | What it means                                                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Blind on-chain envelope**      | Each message is only `{ v, parcelHash, payloadHash }`: two SHA-256 hashes. No business data ever reaches the public ledger.                                                                          |
| **Deterministic canonical form** | One builder turns a record into bytes: trimmed NFC text, fixed-scale decimals, UTC timestamps, sorted keys. The same input always gives the same hash, on the server and in the browser.             |
| **Verify by recomputing**        | Verification rebuilds the bytes from the stored content and hashes them fresh. There is no stored hash to trust. Edit one field in Postgres and that record shows as changed.                        |
| **Ledger first, cache second**   | Postgres is written only after the topic message reaches consensus, so every cached record is anchored.                                                                                              |
| **Multi-signature writes**       | The topic's submit key is a threshold key (for example 2 of 3). The server never holds it. Each write is a scheduled transaction that runs only after enough admins approve it in their own wallets. |
| **Verification in the browser**  | The browser fetches each anchor straight from a public mirror node, so users don't have to trust your server.                                                                                        |
| **Command-line audit**           | `npm run verify` re-checks every record and scans the topic for anchors missing from the database.                                                                                                   |

## How it works

```
 WRITE (staff, multi-signature)                      VERIFY (anyone)
 ──────────────────────────────                      ───────────────
 record ─► canonical bytes ─► SHA-256                stored record ─► canonical bytes ─► SHA-256
                                  │                                                        │
                                  ▼                                                        ▼
        ScheduleCreate(TopicMessageSubmit{v, parcelHash, payloadHash})       mirror node: message at seq N
                                  │                                                        │
        admins approve in their wallets (threshold)                          recomputed == on-chain ?
                                  │                                                        │
        network executes ─► HCS consensus ─► Postgres (read cache)           Verified  |  Changed
```

1. **Propose.** An admin signs in with a Hedera wallet and submits a record. The server validates
   it, computes the hashes, and creates a Hedera _scheduled transaction_ that wraps the topic
   message. The content waits in a staging table.
2. **Approve.** Each approving admin's browser recomputes the envelope from the content on screen
   and checks it against the scheduled message before their wallet signs. The network executes the
   message once the threshold is reached.
3. **Cache.** The server confirms the executed message on the mirror node, checks that it matches
   the staged content, and only then writes it to Postgres.
4. **Verify.** A reader loads a record. Their browser recomputes each hash and compares it with the
   anchor on the mirror node. If anyone edited the database afterwards, the hashes stop matching.

Why not just store the hash? A stored hash proves nothing about the content next to it: whoever can
edit the content can edit the hash too. Recomputing from content is the whole point.

## The demo: Kivu Cargo

The Next.js app in [`packages/nextjs`](packages/nextjs/README.md) is a shipment tracker for a
fictional freight company:

- **Customers** enter a tracking ID at `/` and see the shipment's timeline. Each update is checked
  against the ledger and marked Verified or Changed.
- **Staff** use the portal at `/admin` to book shipments and post updates. Every change needs
  approvals from several staff wallets before it goes on the ledger.

The **tracking ID is the parcel's hash**, and each update is anchored by its own payload hash. The
[demo README](packages/nextjs/README.md) covers the data model, the approval flow, the API and how
to rebrand it.

## Adapting it to your domain

The cargo model is an example. The notary pattern works for anything that needs a public,
tamper-evident history: certificates, supply-chain batches, audit logs, lab results, votes. To
swap the domain:

| Change                  | Where                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Which fields are hashed | `packages/nextjs/lib/canonical/parcel.ts` (the record) and `event.ts` (each update). Reuse the normalizers in `normalize.ts` |
| Database columns        | A new migration in `packages/nextjs/migrations/`, plus the row mapping in `lib/db/rows.ts`                                   |
| Forms and validation    | `packages/nextjs/lib/admin/validation.ts` and `app/components/admin/`                                                        |
| Public page             | `packages/nextjs/app/(public)/` and `app/components/`                                                                        |
| Name and branding       | `packages/nextjs/lib/brand.ts`                                                                                               |

The envelope, hashing, approvals, mirror-node client and verifier don't depend on the domain, so
you can keep them as they are. Keep the invariants in [AGENTS.md](AGENTS.md#critical-invariants).

## Prerequisites

| Requirement         | Notes                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Node.js `>=20.18.3` | CI uses the version in `.nvmrc`                                                           |
| npm                 | The only supported package manager                                                        |
| Docker              | Runs the bundled Postgres. Or bring your own and set `DATABASE_URL`                       |
| Hedera account      | A testnet operator account from [portal.hedera.com](https://portal.hedera.com/)           |
| Hedera wallet(s)    | HashPack, Kabila or Blade, for each admin who approves writes                             |
| WalletConnect ID    | A project ID from [dashboard.reown.com](https://dashboard.reown.com) for the admin portal |

## Quick start

```bash
npm install
cp .env.example .env        # fill in HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY
npm run keys:generate       # dev only: prints throwaway submit + admin key lines for .env
docker compose up -d        # start Postgres
npm run db:migrate          # create tables
npm run topic:create        # create the topic with threshold keys; put the id in HCS_TOPIC_ID
npm run db:seed             # optional: anchor one demo shipment
npm run next:dev            # http://localhost:3000 (public) and /admin (staff)
```

To approve writes from the portal, `HCS_SUBMIT_PUBLIC_KEYS` must be the public keys of the admins'
real wallet accounts, and you need `ADMIN_SESSION_SECRET` (`openssl rand -hex 32`) and
`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. See
[Configuring the threshold keys](packages/nextjs/README.md#configuring-the-threshold-keys).

Check everything against the ledger at any time:

```bash
npm run verify -- --topic 0.0.12345
```

## Environment variables

All variables live in `.env` at the repository root. `.env.example` holds placeholders only.
**Never commit `.env`.**

<!-- AUTO-GENERATED:env (from .env.example; do not edit by hand) -->

| Variable                               | Required             | Used by                              | Description                                                                                                                                                                                        |
| -------------------------------------- | -------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HEDERA_NETWORK`                       | No                   | all                                  | testnet \| previewnet \| mainnet. Default `testnet`.                                                                                                                                               |
| `HEDERA_OPERATOR_ID`                   | Yes                  | server, topic:create, db:seed        | Operator account: pays for topic creation and for approval schedules. It is NOT a submit key.                                                                                                      |
| `HEDERA_OPERATOR_KEY`                  | Yes                  | server, topic:create, db:seed        | DER- or hex-encoded ECDSA/ED25519 private key. Placeholder — never commit a real key.                                                                                                              |
| `HCS_TOPIC_ID`                         | Yes                  | server, verify, db:seed              | Filled in after `npm run topic:create`.                                                                                                                                                            |
| `HCS_SUBMIT_PUBLIC_KEYS`               | Yes                  | server, topic:create                 | Public keys of the administrators' WALLET accounts (comma-separated). Every topic message must be approved from these wallets in the admin console; the web server never holds these private keys. |
| `HCS_SUBMIT_THRESHOLD`                 | Yes                  | server, topic:create                 | How many wallet approvals each message needs (2..N).                                                                                                                                               |
| `HCS_SUBMIT_SIGNER_KEYS`               | db:seed only         | db:seed                              | DEV ONLY: private keys `npm run db:seed` signs with directly. The web server never reads them.                                                                                                     |
| `HCS_ADMIN_PUBLIC_KEYS`                | Yes                  | server, topic:create                 | Public keys of topic administrators (comma-separated). Required to create, update or delete the topic. The running server needs only these PUBLIC keys, to confirm the topic was not altered.      |
| `HCS_ADMIN_THRESHOLD`                  | Yes                  | server, topic:create                 | How many admin signatures are required (2..N).                                                                                                                                                     |
| `HCS_ADMIN_SIGNER_KEYS`                | topic:create only    | topic:create                         | Admin private keys, used ONLY by `npm run topic:create`. Remove them from the server afterwards.                                                                                                   |
| `MIRROR_NODE_URL`                      | No                   | server, browser verification, verify | Default `https://<network>.mirrornode.hedera.com`.                                                                                                                                                 |
| `DATABASE_URL`                         | Yes                  | server, db:migrate, db:seed, verify  | Matches docker-compose.yml defaults.                                                                                                                                                               |
| `TEST_DATABASE_URL`                    | No                   | tests                                | Used by `npm run test`. Its schema is DROPPED on every run; the name must end in _test. Default `postgres://hcs:hcs@localhost:5432/hcs_track_log_test`.                                            |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | For the staff portal | staff portal (browser)               | WalletConnect Cloud project id from https://dashboard.reown.com (32 hex characters).                                                                                                               |
| `ADMIN_SESSION_SECRET`                 | For the staff portal | server                               | HMAC key for sign-in challenges and admin session cookies. Generate: openssl rand -hex 32.                                                                                                         |
| `HCS_APPROVAL_WINDOW_HOURS`            | No                   | server                               | How long a proposal waits for wallet approvals, in hours (1..1488; Hedera allows up to 62 days). Default `24`.                                                                                     |

<!-- /AUTO-GENERATED:env -->

## Scripts

<!-- AUTO-GENERATED:scripts (from package.json; do not edit by hand) -->

| Command                 | Runs                                                                                     | Description                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm run next:dev`      | `next dev`                                                                               | Dev server: customer tracking at `/`, staff portal at `/admin`                                                 |
| `npm run next:build`    | `next build`                                                                             | Production build (type-checks)                                                                                 |
| `npm run next:start`    | `next start`                                                                             | Serve the production build                                                                                     |
| `npm run lint`          | `eslint . && npm run typecheck --workspace=@hcs-track-log/nextjs`                        | ESLint, then `tsc --noEmit`                                                                                    |
| `npm run format`        | `prettier --write .`                                                                     | Format everything with Prettier                                                                                |
| `npm run format:check`  | `prettier --check .`                                                                     | Check formatting without writing (used by CI and hooks)                                                        |
| `npm run test`          | `vitest run`                                                                             | Vitest `unit` + `db` projects; the `db` project needs Postgres                                                 |
| `npm run prepare`       | `husky`                                                                                  | Installs the husky pre-commit hook (runs on `npm install`)                                                     |
| `npm run topic:create`  | `tsx scripts/create-topic.ts`                                                            | Create the topic with threshold admin + submit keys and verify them on-chain                                   |
| `npm run keys:generate` | `tsx scripts/generate-keys.ts`                                                           | Print throwaway submit/admin key sets for local testing (`-- --submit 2/3 --admin 2/3`)                        |
| `npm run db:migrate`    | `tsx scripts/migrate.ts`                                                                 | Apply pending migrations (`-- --down` rolls back the latest)                                                   |
| `npm run db:seed`       | `tsx scripts/seed.ts`                                                                    | Dev only: anchor a demo shipment by signing directly with `HCS_SUBMIT_SIGNER_KEYS`                             |
| `npm run verify`        | `tsx scripts/verify.ts`                                                                  | Recompute every cached update and compare it with the ledger (`-- --topic <id> [--parcel <id>] [--skip-scan]`) |
| `npm run docs:generate` | `node scripts/generate-docs.mjs && prettier --write README.md packages/nextjs/README.md` | Regenerate the README tables from `package.json`, `.env.example` and the API routes                            |

<!-- /AUTO-GENERATED:scripts -->

## Project structure

```
packages/nextjs/
  app/            Next.js App Router: public tracker, staff portal, API routes
  lib/
    canonical/    normalizers + the canonical builders (domain-specific fields)
    hashing/      SHA-256 of the canonical bytes
    envelope/     the on-chain {v, parcelHash, payloadHash} message
    approvals/    propose → approve → finalize (scheduled transactions)
    verify/       recompute-and-compare verifier, topic scan
    mirror/       mirror-node client (messages, schedules, keys)
    hedera/       topic creation, threshold keys, scheduler
    db/           Postgres read cache and staging store
  migrations/     plain SQL (node-pg-migrate)
  scripts/        topic:create, keys:generate, db:migrate, db:seed, verify
```

## Testing

```bash
npm run test                       # unit tests + Postgres tests (needs docker compose up -d)
RUN_TESTNET_TESTS=1 npm run test   # also prove the threshold keys and approval flow on testnet
```

The headline test is `packages/nextjs/lib/verify/tamper.db.test.ts`: it edits one field in Postgres
and checks that exactly that record is flagged.

## Further documentation

- [packages/nextjs/README.md](packages/nextjs/README.md): the Kivu Cargo demo in depth.
- [AGENTS.md](AGENTS.md): invariants and key paths for AI agents and contributors.
- [Hedera Consensus Service](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service),
  [scheduled transactions](https://docs.hedera.com/hedera/core-concepts/scheduled-transaction),
  [mirror node REST API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api),
  [HashScan](https://hashscan.io).

## License

[MIT](./LICENSE)
