import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Single .env at the repository root (next dev/build run with cwd = packages/nextjs).
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@hiero-ledger/sdk", "pg", "node-pg-migrate"],
};

export default nextConfig;
