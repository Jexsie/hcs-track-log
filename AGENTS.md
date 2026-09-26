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
7. **Both topic keys are threshold keys, enforced by the network.** The submit key (≥2 of N) gates every message; the admin key (≥2 of N) gates topic updates and deletion. Neither is a stub or an app-level check.
8. **`.env` is never committed.** `.env.example` holds placeholders only.
9. **npm only.** Never yarn or pnpm. No Solidity.

## Key paths

| Path                                                            | Purpose                                                                                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                                     | Project standards and non-negotiable invariants                                                                                               |
| `template.json`                                                 | scaffold-hbar manifest: capabilities, env vars, onboarding outro                                                                              |
| `.env.example`                                                  | Placeholder environment configuration                                                                                                         |
| `eslint.config.mjs`                                             | ESLint 9 flat config (Next + typescript-eslint strict, no `any`)                                                                              |
| `.husky/pre-commit`                                             | Runs lint-staged (ESLint + Prettier on staged files)                                                                                          |
| `.github/workflows/ci.yml`                                      | CI: install → lint → test → build                                                                                                             |
| `packages/nextjs/app/layout.tsx`                                | Root layout and metadata                                                                                                                      |
| `packages/nextjs/app/globals.css`                               | Tailwind CSS v4 entry: light/dark color tokens mapped to theme colors, custom animations. The only stylesheet; components use utility classes |
| `packages/nextjs/postcss.config.mjs`                            | Registers `@tailwindcss/postcss`                                                                                                              |
| `packages/nextjs/app/components/page-shell.tsx`                 | Shared page column and notice card                                                                                                            |
| `packages/nextjs/app/(public)/page.tsx`                         | Home: search form and how verification works                                                                                                  |
| `packages/nextjs/vitest.config.ts`                              | Test runner configuration                                                                                                                     |
| `packages/nextjs/lib/canonical/normalize.ts`                    | Primitive normalizers: trim + NFC text, positive int, fixed-scale decimal, ISO-8601 Z timestamp                                               |
| `packages/nextjs/lib/canonical/shape.ts`                        | Object/field readers that reject unknown keys and attach field paths to errors                                                                |
| `packages/nextjs/lib/canonical/canonicalize.ts`                 | The single deterministic serializer (sorted keys, compact, UTF-8)                                                                             |
| `packages/nextjs/lib/canonical/event.ts`                        | **Shared event canonical builder** used by submit and verify                                                                                  |
| `packages/nextjs/lib/canonical/parcel.ts`                       | **Shared parcel canonical builder** used by creation and search                                                                               |
| `packages/nextjs/lib/canonical/errors.ts`                       | `FieldError` / `ValidationError`                                                                                                              |
| `packages/nextjs/lib/hashing/sha256.ts`                         | WebCrypto SHA-256 hex, hash format check, tracking-ID input normalization                                                                     |
| `packages/nextjs/lib/hashing/payload-hash.ts`                   | `computePayloadHash`: per-event commitment                                                                                                    |
| `packages/nextjs/lib/hashing/parcel-hash.ts`                    | `computeParcelHash`: public tracking ID                                                                                                       |
| `packages/nextjs/lib/envelope/envelope.ts`                      | `HcsMessageEnvelope` build / serialize / strict parse                                                                                         |
| `packages/nextjs/test/fixtures/records.ts`                      | Reference event and parcel with independently computed digests                                                                                |
| `packages/nextjs/lib/config/env.ts`                             | Typed readers for every env var (fail with the variable's name)                                                                               |
| `packages/nextjs/lib/config/load-env.ts`                        | Loads the repo-root `.env` for CLI scripts                                                                                                    |
| `packages/nextjs/lib/hedera/keys.ts`                            | Parse DER / 0x-hex ECDSA keys                                                                                                                 |
| `packages/nextjs/lib/hedera/client.ts`                          | Hedera client with the operator as fee payer                                                                                                  |
| `packages/nextjs/lib/hedera/threshold-key.ts`                   | Threshold KeyList builder for the `submit` and `admin` roles (≥2 of N), env parsing, signer sufficiency check, on-chain key comparison        |
| `packages/nextjs/lib/hedera/create-topic.ts`                    | Create the topic with threshold admin + submit keys (co-signed by admins) and read both back to confirm                                       |
| `packages/nextjs/lib/hedera/hcs-submitter.ts`                   | `EnvelopeSubmitter` for HCS: freeze, co-sign, submit, wait for the SUCCESS receipt                                                            |
| `packages/nextjs/lib/tracking/ports.ts`                         | `EnvelopeSubmitter` / `TrackingStore` interfaces                                                                                              |
| `packages/nextjs/lib/tracking/anchor.ts`                        | Hash, build the envelope, submit. No DB I/O                                                                                                   |
| `packages/nextjs/lib/tracking/record-event.ts`                  | **HCS-first** event write: anchor, then insert                                                                                                |
| `packages/nextjs/lib/tracking/register-parcel.ts`               | **HCS-first** parcel + first event registration                                                                                               |
| `packages/nextjs/lib/tracking/errors.ts`                        | Write-path errors, incl. `DerivedWriteError` (anchored but not cached)                                                                        |
| `packages/nextjs/scripts/create-topic.ts`                       | `npm run topic:create`                                                                                                                        |
| `packages/nextjs/scripts/generate-keys.ts`                      | `npm run keys:generate`                                                                                                                       |
| `packages/nextjs/test/fakes.ts`                                 | Controllable submitter + in-memory store for ordering tests                                                                                   |
| `packages/nextjs/test/integration/hcs.testnet.test.ts`          | Opt-in live proof that the network enforces both threshold keys (`RUN_TESTNET_TESTS=1`)                                                       |
| `docker-compose.yml`                                            | Postgres 18 for development and tests                                                                                                         |
| `docker/postgres/init/01-create-test-database.sql`              | Creates `hcs_track_log_test` on first start                                                                                                   |
| `packages/nextjs/migrations/1758873600000_initial-schema.sql`   | `parcels` / `cargo_events` schema (no payload hash column)                                                                                    |
| `packages/nextjs/lib/db/migrate.ts`                             | node-pg-migrate runner wrapper                                                                                                                |
| `packages/nextjs/lib/db/pool.ts`                                | `pg` pool (default type parsers kept for lossless round-trip)                                                                                 |
| `packages/nextjs/lib/db/rows.ts`                                | Row types and mapping from columns to canonical-builder input                                                                                 |
| `packages/nextjs/lib/db/tracking-store.ts`                      | Derived writes (`TrackingStore`); parcel and first event in one transaction                                                                   |
| `packages/nextjs/lib/db/tracking-reader.ts`                     | Database-first reads: parcel and events in ledger order                                                                                       |
| `packages/nextjs/lib/hedera/submitter-from-env.ts`              | Builds the submitter from env and verifies the topic's admin and submit keys on-chain                                                         |
| `packages/nextjs/lib/server/http.ts`                            | Bearer auth, JSON helpers, domain error → HTTP mapping, log serialization                                                                     |
| `packages/nextjs/lib/server/write-handlers.ts`                  | Write endpoints (lazy submitter, so bad requests never touch Hedera)                                                                          |
| `packages/nextjs/lib/server/services.ts`                        | Process-wide pool/submitter singletons and handler wiring                                                                                     |
| `packages/nextjs/app/api/parcels/route.ts`                      | `POST /api/parcels`                                                                                                                           |
| `packages/nextjs/app/api/events/route.ts`                       | `POST /api/events` (`{ parcelHash, event }` in the body)                                                                                      |
| `packages/nextjs/scripts/migrate.ts`                            | `npm run db:migrate`                                                                                                                          |
| `packages/nextjs/scripts/seed.ts`                               | `npm run db:seed` (HCS-first demo data)                                                                                                       |
| `packages/nextjs/test/db/global-setup.ts`                       | Drops and recreates the `_test` schema, then runs migrations                                                                                  |
| `packages/nextjs/test/db/database.ts`                           | Test pool (optional session TimeZone), `_test` name guard, truncate                                                                           |
| `packages/nextjs/test/fixtures/parcels.ts`                      | Normalized parcel / recorded-event builders                                                                                                   |
| `packages/nextjs/lib/mirror/mirror-client.ts`                   | Mirror node client: one message by sequence number, paginated listing (same-origin `links.next` only)                                         |
| `packages/nextjs/lib/verify/verdicts.ts`                        | `EventVerdict` / `ParcelVerdict` / `TamperReason`                                                                                             |
| `packages/nextjs/lib/verify/verify-event.ts`                    | **The verifier**: recompute payloadHash from content → fetch anchor → compare                                                                 |
| `packages/nextjs/lib/verify/verify-timeline.ts`                 | Parcel recompute check + bounded-concurrency event verification with progress callback                                                        |
| `packages/nextjs/lib/verify/verify-topic.ts`                    | CLI core: verify all parcels and scan the topic for uncached / foreign messages                                                               |
| `packages/nextjs/lib/verify/tamper.db.test.ts`                  | **Headline test**: edit a location in Postgres → TAMPERED; untouched events verify                                                            |
| `packages/nextjs/lib/timeline/dto.ts`                           | Content-only JSON shape served to clients (no hashes except the tracking ID)                                                                  |
| `packages/nextjs/lib/timeline/lookup-client.ts`                 | Browser lookup client shared by the public page and the admin console                                                                         |
| `packages/nextjs/lib/timeline/format.ts`                        | Deterministic UTC / hash display formatting (identical on server and client)                                                                  |
| `packages/nextjs/lib/server/read-handlers.ts`                   | `loadTimeline` + `POST /api/parcels/lookup` (exact ID in the body, uniform 404, `no-store`)                                                   |
| `packages/nextjs/app/api/parcels/lookup/route.ts`               | `POST /api/parcels/lookup`                                                                                                                    |
| `packages/nextjs/app/components/track-search.tsx`               | Public search: POSTs the tracking ID and renders the verified timeline in place (no ID in the URL)                                            |
| `packages/nextjs/app/(public)/layout.tsx`                       | Public header (blue theme)                                                                                                                    |
| `packages/nextjs/app/admin/layout.tsx`                          | Administrator console shell: violet `data-theme="admin"`, nav, token panel, `noindex`                                                         |
| `packages/nextjs/app/admin/parcels/new/page.tsx`                | Register-parcel form page                                                                                                                     |
| `packages/nextjs/app/admin/events/new/page.tsx`                 | Record-event form page                                                                                                                        |
| `packages/nextjs/app/components/admin/register-parcel-form.tsx` | Parcel + first-event form → `POST /api/parcels`                                                                                               |
| `packages/nextjs/app/components/admin/record-event-form.tsx`    | Parcel lookup + event form → `POST /api/parcels/:hash/events`                                                                                 |
| `packages/nextjs/app/components/admin/event-fields.tsx`         | Shared event fieldset (status, location, carrier, SCAC, local time)                                                                           |
| `packages/nextjs/app/components/admin/field.tsx`                | Accessible labelled input with inline error / hint / datalist                                                                                 |
| `packages/nextjs/app/components/admin/token-panel.tsx`          | Enter / forget the submitter API token                                                                                                        |
| `packages/nextjs/app/components/admin/use-submitter-token.ts`   | Session-scoped token store (`useSyncExternalStore` over sessionStorage)                                                                       |
| `packages/nextjs/app/components/admin/submission-result.tsx`    | Success panel: tracking ID, copy, ledger link, on-chain envelope                                                                              |
| `packages/nextjs/app/components/admin/submit-feedback.tsx`      | Submit button + API error explanations                                                                                                        |
| `packages/nextjs/app/components/admin/envelope-preview.ts`      | Recomputes the submitted envelope in the browser                                                                                              |
| `packages/nextjs/lib/admin/validation.ts`                       | Form state, per-field validation using the shared normalizers, payload builders, server path → field map                                      |
| `packages/nextjs/lib/admin/datetime.ts`                         | `datetime-local` ⇄ canonical UTC                                                                                                              |
| `packages/nextjs/lib/admin/api.ts`                              | Browser client for the write API and parcel lookup                                                                                            |
| `packages/nextjs/lib/server/ledger-links.ts`                    | Topic id + mirror URL for links (null when unconfigured)                                                                                      |
| `packages/nextjs/app/components/tracking-view.tsx`              | Client view: renders the timeline and streams in verdicts                                                                                     |
| `packages/nextjs/app/components/use-verification.ts`            | In-browser verification hook (recompute + mirror node, retry)                                                                                 |
| `packages/nextjs/app/components/verification-banner.tsx`        | Animated "Verifying live ledger integrity…" overlay and result summary                                                                        |
| `packages/nextjs/app/components/event-card.tsx`                 | Timeline row: sequence number, badge, mirror link, security warning                                                                           |
| `packages/nextjs/app/components/parcel-summary.tsx`             | Parcel details and tracking-ID recompute check                                                                                                |
| `packages/nextjs/scripts/verify.ts`                             | `npm run verify`                                                                                                                              |
| `packages/nextjs/test/fake-ledger.ts`                           | In-memory topic serving mirror-node-shaped HTTP responses                                                                                     |

## Commands

| Command              | Purpose                 |
| -------------------- | ----------------------- |
| `npm run lint`       | ESLint + `tsc --noEmit` |
| `npm run test`       | Vitest                  |
| `npm run next:build` | Production build        |
