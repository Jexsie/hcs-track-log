import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/.next/**", "**/coverage/**", "**/next-env.d.ts"]),
  js.configs.recommended,
  ...nextCoreWebVitals,
  ...nextTypescript,
  ...tseslint.configs.strict,
  {
    settings: {
      next: { rootDir: "packages/nextjs/" },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
]);
