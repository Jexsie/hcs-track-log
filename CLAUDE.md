# hcs-track-log — Project Standards

## Stack
- Next.js (App Router) + TypeScript, npm workspaces, Node >=20.18.3
- Hedera: HCS via the Hiero SDK. No Solidity, no smart contracts.
- Postgres (read cache, derived from the ledger)

## Non-negotiable invariants
- Hashing is **SHA-256** over canonicalized content. Never Keccak-256.
- Write path is HCS-first: submit to the topic, and only after consensus success write to Postgres.
- Verification **recomputes** the hash from Postgres content and compares to the on-chain `payloadHash`.
  Never verify a stored hash against the chain. There is no authoritative payload_hash column.
- Only `{ v, parcelHash, payloadHash }` goes on-chain. No business metadata on the ledger.
- The topic enforces a multi-signature submit key.
- npm only — never yarn or pnpm. `.env` is never committed.

## Commands
- Build: `npm run next:build`
- Test: `npm run test`
- Lint: `npm run lint`
- Verify CLI: `npm run verify -- --topic <id>`