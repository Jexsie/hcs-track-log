import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["**/*.test.ts"],
          exclude: ["node_modules/**", ".next/**", "**/*.db.test.ts"],
        },
      },
      {
        // Real Postgres (docker compose up -d). Files share one database, so they run serially.
        extends: true,
        test: {
          name: "db",
          include: ["**/*.db.test.ts"],
          exclude: ["node_modules/**", ".next/**"],
          globalSetup: ["test/db/global-setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
