// npm run docs:generate
//
// Regenerates the AUTO-GENERATED tables from their sources of truth:
//   README.md                  scripts ← package.json, env ← .env.example
//   packages/nextjs/README.md  routes  ← packages/nextjs/app/api/**/route.ts
// Fails if a script, variable or route has no description below, so the docs cannot silently drift.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const SCRIPT_DESCRIPTIONS = {
  "next:dev": "Dev server: customer tracking at `/`, staff portal at `/admin`",
  "next:build": "Production build (type-checks)",
  "next:start": "Serve the production build",
  lint: "ESLint, then `tsc --noEmit`",
  format: "Format everything with Prettier",
  "format:check": "Check formatting without writing (used by CI and hooks)",
  prepare: "Installs the husky pre-commit hook (runs on `npm install`)",
  "topic:create": "Create the topic with threshold admin + submit keys and verify them on-chain",
  "keys:generate":
    "Print throwaway submit/admin key sets for local testing (`-- --submit 2/3 --admin 2/3`)",
  "db:migrate": "Apply pending migrations (`-- --down` rolls back the latest)",
  verify:
    "Recompute every cached update and compare it with the ledger (`-- --topic <id> [--parcel <id>] [--skip-scan]`)",
  "docs:generate":
    "Regenerate the README tables from `package.json`, `.env.example` and the API routes",
};

// [required, used by, default] per the readers in packages/nextjs/lib/server/config/env.ts
const ENV_META = {
  HEDERA_NETWORK: ["No", "all", "Default `testnet`."],
  HEDERA_OPERATOR_ID: ["Yes", "server, topic:create", ""],
  HEDERA_OPERATOR_KEY: ["Yes", "server, topic:create", ""],
  HCS_TOPIC_ID: ["Yes", "server, verify", ""],
  HCS_SUBMIT_PUBLIC_KEYS: ["Yes", "server, topic:create", ""],
  HCS_SUBMIT_THRESHOLD: ["Yes", "server, topic:create", ""],
  HCS_ADMIN_PUBLIC_KEYS: ["Yes", "server, topic:create", ""],
  HCS_ADMIN_THRESHOLD: ["Yes", "server, topic:create", ""],
  HCS_ADMIN_SIGNER_KEYS: ["topic:create only", "topic:create", ""],
  MIRROR_NODE_URL: [
    "No",
    "server, browser verification, verify",
    "Default `https://<network>.mirrornode.hedera.com`.",
  ],
  DATABASE_URL: ["Yes", "server, db:migrate, verify", ""],
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: ["For the staff portal", "staff portal (browser)", ""],
  ADMIN_SESSION_SECRET: ["For the staff portal", "server", ""],
  HCS_APPROVAL_WINDOW_HOURS: ["No", "server", "Default `24`."],
};

const ROUTE_ACCESS = {
  "/api/parcels/lookup": "public",
  "/api/admin/auth/challenge": "public",
  "/api/admin/auth/session": "`POST` public; `GET`/`DELETE` staff session",
  "/api/admin/submissions": "staff session",
  "/api/admin/submissions/finalize": "staff session",
};

const problems = [];
const cell = (text) => text.replaceAll("|", "\\|");

// scripts
const rootScripts = JSON.parse(read("package.json")).scripts;
const workspaceScripts = JSON.parse(read("packages/nextjs/package.json")).scripts;

const runs = (command) => {
  const m = /^npm run (\S+) --workspace=\S+/.exec(command);

  return m ? (workspaceScripts[m[1]] ?? command) : command;
};

const scripts = ["| Command | Runs | Description |", "| --- | --- | --- |"];

for (const [name, command] of Object.entries(rootScripts)) {
  if (!SCRIPT_DESCRIPTIONS[name]) {
    problems.push(`describe script "${name}" in scripts/generate-docs.mjs`);
  }

  scripts.push(
    `| \`npm run ${name}\` | \`${cell(runs(command))}\` | ${SCRIPT_DESCRIPTIONS[name] ?? ""} |`,
  );
}

// env: the comment block directly above each variable in .env.example
const env = ["| Variable | Required | Used by | Description |", "| --- | --- | --- | --- |"];
let comment = [];

for (const line of read(".env.example").split("\n")) {
  if (line.startsWith("# ───") || line.trim() === "") {
    comment = [];
    continue;
  }

  if (line.startsWith("#")) {
    comment.push(line.slice(1).trim());
    continue;
  }

  const m = /^([A-Z_]+)=/.exec(line);

  if (!m) continue;
  const name = m[1];
  const meta = ENV_META[name];

  if (!meta) problems.push(`classify env var "${name}" in scripts/generate-docs.mjs`);
  const [required, usedBy, dflt] = meta ?? ["?", "?", ""];
  const text = comment.join(" ").replace(/\.?$/, comment.length ? "." : "");

  env.push(
    `| \`${name}\` | ${required} | ${usedBy} | ${cell([text, dflt].filter(Boolean).join(" "))} |`,
  );
  comment = [];
}

// routes
const apiDir = join(ROOT, "packages/nextjs/app/api");
const walk = (dir) =>
  readdirSync(dir).flatMap((f) =>
    statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)],
  );
const routes = ["| Route | Methods | Access | Source |", "| --- | --- | --- | --- |"];

for (const file of walk(apiDir)
  .filter((f) => f.endsWith("/route.ts"))
  .sort()) {
  const path = `/api/${relative(apiDir, file).replace(/\/route\.ts$/, "")}`;
  const methods = [
    ...readFileSync(file, "utf8").matchAll(
      /export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)/g,
    ),
  ].map((m) => `\`${m[1]}\``);

  if (!ROUTE_ACCESS[path]) {
    problems.push(`classify access for route "${path}" in scripts/generate-docs.mjs`);
  }

  routes.push(
    `| \`${path}\` | ${methods.join(" ")} | ${ROUTE_ACCESS[path] ?? "?"} | \`${relative(join(ROOT, "packages/nextjs"), file)}\` |`,
  );
}

if (problems.length) {
  console.error(`❌ docs:generate\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

const TARGETS = [
  { file: "README.md", blocks: { scripts, env } },
  { file: "packages/nextjs/README.md", blocks: { routes } },
];
const SOURCES = { scripts: "package.json", env: ".env.example", routes: "app/api/**/route.ts" };

for (const { file, blocks } of TARGETS) {
  let readme = read(file);

  for (const [name, rows] of Object.entries(blocks)) {
    const pattern = new RegExp(
      `<!-- AUTO-GENERATED:${name} [\\s\\S]*?<!-- /AUTO-GENERATED:${name} -->`,
    );

    if (!pattern.test(readme)) {
      console.error(`❌ ${file} has no AUTO-GENERATED:${name} markers`);
      process.exit(1);
    }

    const block = `<!-- AUTO-GENERATED:${name} (from ${SOURCES[name]}; do not edit by hand) -->\n\n${rows.join("\n")}\n\n<!-- /AUTO-GENERATED:${name} -->`;

    readme = readme.replace(pattern, () => block);
  }

  writeFileSync(join(ROOT, file), readme);
}

console.log(
  `✅ README tables: ${scripts.length - 2} scripts · ${env.length - 2} env vars · ${routes.length - 2} routes`,
);
