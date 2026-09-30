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
   (`lib/cargo/parcel.ts`, `lib/cargo/event.ts`): sorted keys, compact separators, UTF-8,
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

All code lives in `packages/nextjs/`. `lib/` has five groups; the first is what the template is
about, the second is what you replace for your own domain.

| Group         | Path                                  | What it holds                                                                 |
| ------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| **notary**    | `lib/notary/canonicalize.ts`          | The single deterministic serializer (sorted keys, compact, UTF-8)             |
| (the core)    | `lib/notary/normalize.ts`, `shape.ts` | Primitive normalizers and strict object readers (unknown fields rejected)     |
|               | `lib/notary/sha256.ts`                | WebCrypto SHA-256 and tracking-ID parsing                                     |
|               | `lib/notary/envelope.ts`              | Build, serialize and strictly parse `{ v, parcelHash, payloadHash }`          |
|               | `lib/notary/verify/`                  | **The verifier**: recompute → fetch anchor → compare; topic scan for the CLI  |
| **cargo**     | `lib/cargo/parcel.ts`, `event.ts`     | **The domain schema**: hashed fields, canonical builders, `compute*Hash`      |
| (the demo)    | `lib/cargo/admin/`                    | Staff forms: validation, local-time input, sample data, browser API client    |
|               | `lib/cargo/timeline/`                 | Public timeline shape, ordering, formatting, HashScan links                   |
|               | `lib/cargo/brand.ts`                  | Demo branding (Kivu Cargo)                                                    |
| **approvals** | `lib/approvals/propose.ts`            | Validate → hash → `ScheduleCreate` → stage. Never touches the cache           |
|               | `lib/approvals/finalize.ts`           | Executed + matches recomputed envelope → cache write; else pending / rejected |
|               | `lib/approvals/expected-envelope.ts`  | Envelope from content, shared by the browser pre-approval check and finalize  |
| **hedera**    | `lib/hedera/*.ts`                     | Topic creation, threshold keys, scheduler, operator client                    |
|               | `lib/hedera/mirror/`                  | Mirror-node client: messages, schedules, account and topic keys               |
|               | `lib/hedera/wallet/`                  | WalletConnect, HIP-820 requests, the `ScheduleSign` a wallet approves         |
|               | `lib/hedera/proto/`                   | Bounds-checked protobuf decoding of untrusted wallet / mirror bytes           |
| **server**    | `lib/server/*-handlers.ts`            | Staff API (sign-in, propose, finalize) and public lookup                      |
|               | `lib/server/services.ts`              | Process-wide wiring of Postgres, Hedera and the mirror node                   |
|               | `lib/server/db/`                      | Pool, migrations runner, read cache, staging store, column → content mapping  |
|               | `lib/server/auth/`                    | HMAC challenge + session tokens, HIP-820 signature check, wallet sign-in      |
|               | `lib/server/config/env.ts`            | Typed readers for every env var                                               |
| **app**       | `app/(public)/`, `app/admin/`         | Customer tracker and staff portal pages                                       |
|               | `app/components/use-verification.ts`  | The verifier, run in the customer's browser                                   |
| **other**     | `migrations/`, `scripts/`             | Plain SQL schema; `topic:create`, `keys:generate`, `db:migrate`, `verify`     |
|               | `.env.example`, `template.json`       | Env placeholders; scaffold-hbar manifest                                      |

The notary primitives import nothing outside `lib/notary/`. Only `notary/verify/` reaches out: to
the cargo hash functions and the mirror client, because that is where the pieces meet.

## Common tasks

| Task                      | Do this                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change a hashed field     | Edit the canonical builder, add a migration, update `lib/server/db/rows.ts` and the forms in `lib/cargo/admin/`. Old anchors will not match the new shape, so start a fresh topic and database |
| Add an env var            | `.env.example` (with a comment), `lib/server/config/env.ts`, `template.json`, `ENV_META` in `scripts/generate-docs.mjs`, then `npm run docs:generate`                                          |
| Add a script or API route | Describe it in `scripts/generate-docs.mjs`, then `npm run docs:generate`                                                                                                                       |
| Add a migration           | New timestamped file in `migrations/` with a working `-- Down Migration`                                                                                                                       |
| Change UI copy            | Plain cargo language, no ledger jargon, no emojis                                                                                                                                              |

## Commands

| Command                 | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `npm run lint`          | ESLint + `tsc --noEmit`                          |
| `npm run next:build`    | Production build                                 |
| `npm run verify`        | Recompute everything and compare with the ledger |
| `npm run docs:generate` | Regenerate README reference tables               |
