import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Repository-root .env (packages/nextjs/lib/config → ../../../../.env). */
const ROOT_ENV = fileURLToPath(new URL("../../../../.env", import.meta.url));

/**
 * Load the repository-root .env for CLI scripts. Variables already set in the environment win.
 * A missing file is fine: CI and production inject variables directly.
 */
export function loadRootEnv(): void {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
}
