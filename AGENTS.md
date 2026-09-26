# AGENTS.md

Guidance for AI agents and contributors working on **hcs-track-log**. `CLAUDE.md` holds the
same invariants in short form; if anything conflicts, `CLAUDE.md` wins.

## Overview

A cargo & package tracker. Authorized submitters notarize shipment events on a Hedera Consensus
Service topic that is protected by a threshold (multi-signature) submit key. Only
`{ v, parcelHash, payloadHash }` goes on-chain. Readable detail lives in Postgres, which is a
cache derived from the ledger. Anyone can search a parcel by its `parcelHash` and verify each
event. Verification recomputes the SHA-256 from the Postgres content and compares it to the
on-chain anchor.

## Flow

```
 SUBMIT                                            SEARCH & VERIFY
 ──────                                            ───────────────
 form input                                        user enters parcelHash
    │                                                   │
    ▼                                                   ▼
 normalize + validate (trim, NFC, types)           Postgres: parcel + events ──► timeline (instant)
    │                                                   │
    ▼                                                   ▼  for each event
 canonical builder  ◄───────── SAME FUNCTION ─────► canonical builder (from DB columns)
    │                                                   │
    ▼                                                   ▼
 SHA-256 → payloadHash                             SHA-256 → recomputed payloadHash
    │                                                   │
    ▼                                                   ▼
 envelope {v, parcelHash, payloadHash}             mirror node: GET /topics/{id}/messages/{seq}
    │                                                   │
    ▼                                                   ▼
 HCS topic (threshold submit key)                  compare on-chain parcelHash == searched
    │  consensus OK?                               compare on-chain payloadHash == recomputed
    ├── no  → abort, nothing written                    │
    ▼ yes                                               ▼
 Postgres INSERT (content + hcs_sequence_number)   ✅ Verified  |  ⚠ TAMPERED at seq N
```

## Critical invariants

1. **HCS-first write.** Submit to the topic and wait for consensus success before writing to
   Postgres. Never write to Postgres first. A failed submission leaves no row.
2. **Recompute, never retrieve.** Verification rebuilds canonical bytes from Postgres content
   and hashes them fresh. There is no stored hash column used for verification. No code path
   compares a stored hash to the chain. Any hash shown in the UI is recomputed.
3. **Two disjoint hashes.** `parcelHash` covers the immutable parcel fields: consignment,
   parties, bookingRef and createdAt. `payloadHash` covers the per-event fields: status,
   location, carrier and timestamp. No field appears in both.
4. **One canonical builder.** Submit and verify share a single serialization function. Keys are
   sorted, separators compact, output is UTF-8, decimals are fixed-scale strings and timestamps
   are ISO-8601 UTC with a `Z` suffix.
5. **SHA-256 only.** Never Keccak-256.
6. **No business metadata on-chain.** The envelope is `{ v, parcelHash, payloadHash }` only.
7. **Multi-sig submit key is enforced** on the topic itself, not in application code.
8. **`.env` is never committed.** `.env.example` holds placeholders only.
9. **npm only.** Never yarn or pnpm. No Solidity.

## Key paths

| Path                                                           | Purpose                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                                    | Project standards and non-negotiable invariants                                                 |
| `template.json`                                                | scaffold-hbar manifest: capabilities, env vars, onboarding outro                                |
| `.env.example`                                                 | Placeholder environment configuration                                                           |
| `eslint.config.mjs`                                            | ESLint 9 flat config (Next + typescript-eslint strict, no `any`)                                |
| `.husky/pre-commit`                                            | Runs lint-staged (ESLint + Prettier on staged files)                                            |
| `.github/workflows/ci.yml`                                     | CI: install → lint → test → build                                                               |
| `packages/nextjs/app/layout.tsx`                               | Root layout and metadata                                                                        |
| `packages/nextjs/app/page.tsx`                                 | Home page                                                                                       |
| `packages/nextjs/vitest.config.ts`                             | Test runner configuration                                                                       |
| `packages/nextjs/lib/canonical/normalize.ts`                   | Primitive normalizers: trim + NFC text, positive int, fixed-scale decimal, ISO-8601 Z timestamp |
| `packages/nextjs/lib/canonical/shape.ts`                       | Object/field readers that reject unknown keys and attach field paths to errors                  |
| `packages/nextjs/lib/canonical/canonicalize.ts`                | The single deterministic serializer (sorted keys, compact, UTF-8)                               |
| `packages/nextjs/lib/canonical/event.ts`                       | **Shared event canonical builder** used by submit and verify                                    |
| `packages/nextjs/lib/canonical/parcel.ts`                      | **Shared parcel canonical builder** used by creation and search                                 |
| `packages/nextjs/lib/canonical/errors.ts`                      | `FieldError` / `ValidationError`                                                                |
| `packages/nextjs/lib/hashing/sha256.ts`                        | WebCrypto SHA-256 hex, hash format check, tracking-ID input normalization                       |
| `packages/nextjs/lib/hashing/payload-hash.ts`                  | `computePayloadHash`: per-event commitment                                                      |
| `packages/nextjs/lib/hashing/parcel-hash.ts`                   | `computeParcelHash`: public tracking ID                                                         |
| `packages/nextjs/lib/envelope/envelope.ts`                     | `HcsMessageEnvelope` build / serialize / strict parse                                           |
| `packages/nextjs/test/fixtures/records.ts`                     | Reference event and parcel with independently computed digests                                  |
| `packages/nextjs/lib/config/env.ts`                            | Typed readers for every env var (fail with the variable's name)                                 |
| `packages/nextjs/lib/config/load-env.ts`                       | Loads the repo-root `.env` for CLI scripts                                                      |
| `packages/nextjs/lib/hedera/keys.ts`                           | Parse DER / 0x-hex ECDSA keys                                                                   |
| `packages/nextjs/lib/hedera/client.ts`                         | Hedera client with the operator as fee payer                                                    |
| `packages/nextjs/lib/hedera/submit-key.ts`                     | Threshold KeyList builder (≥2 of N), signer sufficiency check, on-chain key comparison          |
| `packages/nextjs/lib/hedera/create-topic.ts`                   | Create the topic with the submit key (no admin key) and read it back to confirm                 |
| `packages/nextjs/lib/hedera/hcs-submitter.ts`                  | `EnvelopeSubmitter` for HCS: freeze, co-sign, submit, wait for the SUCCESS receipt              |
| `packages/nextjs/lib/tracking/ports.ts`                        | `EnvelopeSubmitter` / `TrackingStore` interfaces                                                |
| `packages/nextjs/lib/tracking/anchor.ts`                       | Hash, build the envelope, submit. No DB I/O                                                     |
| `packages/nextjs/lib/tracking/record-event.ts`                 | **HCS-first** event write: anchor, then insert                                                  |
| `packages/nextjs/lib/tracking/register-parcel.ts`              | **HCS-first** parcel + first event registration                                                 |
| `packages/nextjs/lib/tracking/errors.ts`                       | Write-path errors, incl. `DerivedWriteError` (anchored but not cached)                          |
| `packages/nextjs/scripts/create-topic.ts`                      | `npm run topic:create`                                                                          |
| `packages/nextjs/scripts/generate-keys.ts`                     | `npm run keys:generate`                                                                         |
| `packages/nextjs/test/fakes.ts`                                | Controllable submitter + in-memory store for ordering tests                                     |
| `packages/nextjs/test/integration/hcs.testnet.test.ts`         | Opt-in live proof of submit-key enforcement (`RUN_TESTNET_TESTS=1`)                             |
| `docker-compose.yml`                                           | Postgres 18 for development and tests                                                           |
| `docker/postgres/init/01-create-test-database.sql`             | Creates `hcs_track_log_test` on first start                                                     |
| `packages/nextjs/migrations/1758873600000_initial-schema.sql`  | `parcels` / `cargo_events` schema (no payload hash column)                                      |
| `packages/nextjs/lib/db/migrate.ts`                            | node-pg-migrate runner wrapper                                                                  |
| `packages/nextjs/lib/db/pool.ts`                               | `pg` pool (default type parsers kept for lossless round-trip)                                   |
| `packages/nextjs/lib/db/rows.ts`                               | Row types and mapping from columns to canonical-builder input                                   |
| `packages/nextjs/lib/db/tracking-store.ts`                     | Derived writes (`TrackingStore`); parcel and first event in one transaction                     |
| `packages/nextjs/lib/db/tracking-reader.ts`                    | Database-first reads: parcel and events in ledger order                                         |
| `packages/nextjs/lib/hedera/submitter-from-env.ts`             | Builds the submitter from env and verifies the topic's submit key on-chain                      |
| `packages/nextjs/lib/server/http.ts`                           | Bearer auth, JSON helpers, domain error → HTTP mapping, log serialization                       |
| `packages/nextjs/lib/server/write-handlers.ts`                 | Write endpoints (lazy submitter, so bad requests never touch Hedera)                            |
| `packages/nextjs/lib/server/services.ts`                       | Process-wide pool/submitter singletons and handler wiring                                       |
| `packages/nextjs/app/api/parcels/route.ts`                     | `POST /api/parcels`                                                                             |
| `packages/nextjs/app/api/parcels/[parcelHash]/events/route.ts` | `POST /api/parcels/:parcelHash/events`                                                          |
| `packages/nextjs/scripts/migrate.ts`                           | `npm run db:migrate`                                                                            |
| `packages/nextjs/scripts/seed.ts`                              | `npm run db:seed` (HCS-first demo data)                                                         |
| `packages/nextjs/test/db/global-setup.ts`                      | Drops and recreates the `_test` schema, then runs migrations                                    |
| `packages/nextjs/test/db/database.ts`                          | Test pool (optional session TimeZone), `_test` name guard, truncate                             |
| `packages/nextjs/test/fixtures/parcels.ts`                     | Normalized parcel / recorded-event builders                                                     |

## Commands

| Command              | Purpose                 |
| -------------------- | ----------------------- |
| `npm run lint`       | ESLint + `tsc --noEmit` |
| `npm run test`       | Vitest                  |
| `npm run next:build` | Production build        |
