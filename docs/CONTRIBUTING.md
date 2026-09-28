# Contributing

Read [`CLAUDE.md`](../CLAUDE.md) first. Its invariants are non-negotiable: SHA-256 only, HCS-first writes,
verification by recomputation, and only `{ v, parcelHash, payloadHash }` on-chain.
[`AGENTS.md`](../AGENTS.md) maps every important file.

## Prerequisites

- Node.js `>=20.18.3`. CI uses the version in `.nvmrc`.
- npm. Do not use yarn or pnpm.
- Docker, for the bundled Postgres 18.

## Setup

```bash
npm install                 # also installs the pre-commit hook
cp .env.example .env
docker compose up -d        # Postgres: hcs_track_log + hcs_track_log_test
npm run db:migrate
npm run next:dev            # http://localhost:3000 and /admin
```

Run `npm run db:migrate` again whenever you pull a change that adds a file under
`packages/nextjs/migrations/`. Every command is listed in the [scripts table](../README.md#scripts).

## Tests

`npm run test` runs two Vitest projects:

| Project | Files             | Notes                                                                                                                                                                             |
| ------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit`  | `**/*.test.ts`    | Pure logic. Runs in parallel.                                                                                                                                                     |
| `db`    | `**/*.db.test.ts` | Real Postgres at `TEST_DATABASE_URL`. Files run one at a time. The suite **drops the schema** and re-runs migrations, and refuses any database whose name doesn't end in `_test`. |

Live network tests in `test/integration/*.testnet*` are skipped unless you set
`RUN_TESTNET_TESTS=1`. They spend a few testnet cents from `HEDERA_OPERATOR_ID`.

Writing tests:

- Put tests next to the code as `<module>.test.ts`, or `<module>.db.test.ts` if they need Postgres.
- Reuse the fakes in `test/`:
  - `FakeLedger` is an in-memory topic and schedule service that answers in the mirror node's exact JSON shape.
  - `InMemoryStore` and `ControlledSubmitter` control the order of writes and submissions.
  - `walletSign` signs like a HIP-820 wallet.
- Anything touching the write or verify path needs a failing test first. Check that the test fails when the rule it guards
  is broken, for example by temporarily removing the recomputation. The tamper test
  (`lib/verify/tamper.db.test.ts`) and the approval workflow test (`lib/approvals/workflow.db.test.ts`) are the models to
  follow.

## Code style

- **ESLint 9 flat config** (`eslint.config.mjs`): Next core-web-vitals plus typescript-eslint `strict`. `any`, non-null
  assertions and unused variables are errors.
- **TypeScript** is strict, with `noUncheckedIndexedAccess`.
- **Prettier** formats code; `CLAUDE.md` is excluded.
- **Pre-commit hook** (husky + lint-staged): runs `eslint --fix` and `prettier --write` on staged files.
- **UI copy** uses plain cargo language, with no ledger jargon and no emojis. Hedera is named once, on the home page. See
  "UI wording" in the README.
- **Branding** lives in `packages/nextjs/lib/brand.ts`.

## Commits and pull requests

- Sign off every commit: `git commit -s -m "type: summary"`. Use conventional prefixes: `feat`, `fix`, `refactor`, `docs`,
  `chore`.
- Never commit `.env` or any private key.

PR checklist:

- [ ] `npm run lint`, `npm run test` and `npm run next:build` pass (CI runs the same three).
- [ ] New behaviour has tests, and the tests fail without the change.
- [ ] No stored hash is ever compared with the chain; hashes are recomputed from content.
- [ ] Nothing reaches `parcels` / `cargo_events` before its topic message has reached consensus.
- [ ] New env vars are in `.env.example` and `template.json`, then regenerate the README tables (below).
- [ ] New migrations are additive or have a working `-- Down Migration`.
- [ ] `AGENTS.md` key paths list any new important file.

## Regenerating README reference tables

The README's script, environment and route tables sit between `<!-- AUTO-GENERATED:… -->` markers and are produced from
`package.json`, `.env.example` and `app/api/**/route.ts`. Don't edit them by hand. Change the source, then run
`npm run docs:generate`. It fails if a new script, variable or route isn't described in `scripts/generate-docs.mjs`,
so the docs can't silently drift.
