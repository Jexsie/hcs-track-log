# AGENTS.md

Orientation for AI agents and contributors working on **hcs-track-log**, a template for
tamper-evident records on the Hedera Consensus Service. The bundled demo is a cargo tracker
(Kivu Cargo). `CLAUDE.md` holds the same invariants in short form; if anything conflicts,
`CLAUDE.md` wins.

- Template overview: [README.md](README.md)
- Demo behaviour, API and data model: [packages/nextjs/README.md](packages/nextjs/README.md)

## Critical invariants

Break one of these and the app still runs, but its proofs become meaningless.

1. **HCS-first write.** Nothing reaches `parcels` / `cargo_events` until its topic message has
   reached consensus. Proposals live in `pending_submissions`, which the tracker and verifier never
   read. They are cached only after the executed message is on the mirror node and matches an
   envelope recomputed from the staged content (`lib/approvals/finalize.ts`).
2. **Recompute, never retrieve.** Verification rebuilds canonical bytes from Postgres content and
   hashes them fresh. There is no payload-hash column, and no code path compares a stored hash with
   the chain. Every hash shown in the UI is recomputed.
3. **One canonical builder per record type.** Submit and verify call the same function
   (`lib/canonical/parcel.ts`, `lib/canonical/event.ts`): sorted keys, compact separators, UTF-8,
   trimmed NFC text, fixed-scale decimal strings, ISO-8601 UTC `Z` timestamps. Unknown fields are
   rejected.
4. **Two disjoint hashes.** `parcelHash` (the tracking ID) covers the immutable parcel fields;
   `payloadHash` covers one event's fields. No field is in both.
5. **SHA-256 only.** Never Keccak-256.
6. **Blind envelope.** The on-chain message is exactly `{ v, parcelHash, payloadHash }`. Schedule
   memos carry only an opaque submission UUID. No business data on the ledger.
7. **Network-enforced threshold keys.** Submit and admin keys are ≥2-of-N `KeyList`s. The web server
   holds no submit key; messages execute only after enough admins sign the schedule in their
   wallets. The operator must never be a submit key (`assertOperatorNotSubmitter`).
8. **Secrets and tooling.** `.env` is never committed. npm only, never yarn or pnpm. No Solidity.

## Key paths

All code lives in `packages/nextjs/`. Paths below are relative to it unless they start at the root.

| Area                   | Path                                  | What it holds                                                                 |
| ---------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| **Canonical form**     | `lib/canonical/normalize.ts`          | Primitive normalizers (text, int, decimal, timestamp)                         |
|                        | `lib/canonical/parcel.ts`, `event.ts` | **The canonical builders.** Domain fields are defined here                    |
|                        | `lib/canonical/canonicalize.ts`       | The single deterministic serializer                                           |
| **Hashing / envelope** | `lib/hashing/`                        | WebCrypto SHA-256, `computeParcelHash`, `computePayloadHash`                  |
|                        | `lib/envelope/envelope.ts`            | Build, serialize and strictly parse the on-chain message                      |
| **Write path**         | `lib/approvals/propose.ts`            | Validate → hash → `ScheduleCreate` → stage. Never touches the cache           |
|                        | `lib/approvals/finalize.ts`           | Executed + matches recomputed envelope → cache write; else pending / rejected |
|                        | `lib/approvals/expected-envelope.ts`  | Envelope from content, shared by browser pre-approval check and finalize      |
|                        | `lib/db/pending-store.ts`             | Staging table; `complete()` writes the cache in one transaction               |
| **Verify path**        | `lib/verify/verify-event.ts`          | **The verifier**: recompute → fetch anchor → compare                          |
|                        | `lib/verify/verify-topic.ts`          | CLI core: all parcels + topic scan for uncached / foreign messages            |
|                        | `app/components/use-verification.ts`  | The same check, run in the customer's browser                                 |
| **Ledger access**      | `lib/mirror/`                         | Mirror-node client (messages, schedules, account and topic keys)              |
|                        | `lib/hedera/`                         | Topic creation, threshold keys, scheduler, operator client                    |
|                        | `lib/proto/`                          | Bounds-checked protobuf decoding of untrusted wallet / mirror bytes           |
| **Auth**               | `lib/admin-auth/`                     | HMAC challenge + session tokens, HIP-820 signature check, wallet sign-in      |
|                        | `lib/wallet/`                         | WalletConnect client, HIP-820 requests, `ScheduleSign` builder                |
| **Server**             | `lib/server/admin-handlers.ts`        | Staff API: sign-in, propose, finalize, error mapping                          |
|                        | `lib/server/read-handlers.ts`         | Public lookup (`POST /api/parcels/lookup`)                                    |
|                        | `lib/server/services.ts`              | Process-wide wiring of Postgres, Hedera and the mirror node                   |
|                        | `lib/config/env.ts`                   | Typed readers for every env var                                               |
| **Data**               | `migrations/`                         | Plain SQL schema (no payload-hash column)                                     |
|                        | `lib/db/rows.ts`                      | Column → canonical-builder input mapping                                      |
| **UI**                 | `app/(public)/`, `app/admin/`         | Customer tracker and staff portal pages                                       |
|                        | `app/components/`                     | Timeline, verdicts, forms, approval cards                                     |
|                        | `lib/brand.ts`                        | Demo branding (Kivu Cargo)                                                    |
| **Scripts**            | `scripts/`                            | `topic:create`, `keys:generate`, `db:migrate`, `db:seed`, `verify`            |
| **Repo (root)**        | `.env.example`, `template.json`       | Env placeholders; scaffold-hbar manifest                                      |
|                        | `scripts/generate-docs.mjs`           | Regenerates the README tables; fails on undocumented scripts, vars or routes  |

## Common tasks

| Task                      | Do this                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change a hashed field     | Edit the canonical builder, add a migration, update `lib/db/rows.ts`, forms and fixtures. Old anchors will not match the new shape, so start a fresh topic and database |
| Add an env var            | `.env.example` (with a comment), `lib/config/env.ts`, `template.json`, `ENV_META` in `scripts/generate-docs.mjs`, then `npm run docs:generate`                          |
| Add a script or API route | Describe it in `scripts/generate-docs.mjs`, then `npm run docs:generate`                                                                                                |
| Add a migration           | New timestamped file in `migrations/` with a working `-- Down Migration`                                                                                                |
| Change UI copy            | Plain cargo language, no ledger jargon, no emojis                                                                                                                       |

## Commands

| Command                 | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `npm run lint`          | ESLint + `tsc --noEmit`                          |
| `npm run next:build`    | Production build                                 |
| `npm run verify`        | Recompute everything and compare with the ledger |
| `npm run docs:generate` | Regenerate README reference tables               |
