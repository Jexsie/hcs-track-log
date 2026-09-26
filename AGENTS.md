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

| Path                               | Purpose                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| `CLAUDE.md`                        | Project standards and non-negotiable invariants                  |
| `template.json`                    | scaffold-hbar manifest: capabilities, env vars, onboarding outro |
| `.env.example`                     | Placeholder environment configuration                            |
| `eslint.config.mjs`                | ESLint 9 flat config (Next + typescript-eslint strict, no `any`) |
| `.husky/pre-commit`                | Runs lint-staged (ESLint + Prettier on staged files)             |
| `.github/workflows/ci.yml`         | CI: install → lint → test → build                                |
| `packages/nextjs/app/layout.tsx`   | Root layout and metadata                                         |
| `packages/nextjs/app/page.tsx`     | Home page                                                        |
| `packages/nextjs/vitest.config.ts` | Test runner configuration                                        |

## Commands

| Command              | Purpose                 |
| -------------------- | ----------------------- |
| `npm run lint`       | ESLint + `tsc --noEmit` |
| `npm run test`       | Vitest                  |
| `npm run next:build` | Production build        |
