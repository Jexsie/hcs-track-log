/**
 * npm run keys:generate -- [--submit 2/3] [--admin 2/3]
 *
 * Generates ED25519 keypairs for the topic's submit key and admin key (threshold/count each) and
 * prints .env lines for a local/dev setup. In production each authorized party generates its own
 * key and shares only the public key.
 */
import { parseArgs } from "node:util";
import { PrivateKey } from "@hiero-ledger/sdk";

const { values } = parseArgs({
  options: {
    submit: { type: "string", default: "2/3" },
    admin: { type: "string", default: "2/3" },
  },
});

function parseSpec(spec: string, role: string): { threshold: number; count: number } {
  const match = /^(\d+)\/(\d+)$/.exec(spec);
  const threshold = Number(match?.[1]);
  const count = Number(match?.[2]);

  if (!match || threshold < 2 || threshold > count) {
    console.error(
      `❌ --${role} must be THRESHOLD/COUNT with 2 <= threshold <= count, got "${spec}"`,
    );
    process.exit(1);
  }

  return { threshold, count };
}

function printRole(role: "submit" | "admin", spec: string, purpose: string): void {
  const { threshold, count } = parseSpec(spec, role);
  const prefix = `HCS_${role.toUpperCase()}`;
  const keys = Array.from({ length: count }, () => PrivateKey.generateED25519());

  console.log(`\n# ${role} key: ${threshold}-of-${count}, ${purpose}`);
  console.log(`${prefix}_PUBLIC_KEYS=${keys.map((k) => k.publicKey.toStringDer()).join(",")}`);
  console.log(`${prefix}_THRESHOLD=${threshold}`);
  console.log(
    `${prefix}_SIGNER_KEYS=${keys
      .slice(0, threshold)
      .map((k) => k.toStringDer())
      .join(",")}`,
  );

  if (count > threshold) {
    console.log(`# Spare ${role} private keys (store offline):`);
    for (const k of keys.slice(threshold)) console.log(`# ${k.toStringDer()}`);
  }
}

console.log("# The *_SIGNER_KEYS below are SECRET: .env only, never git.");
printRole("submit", values.submit, "required for every message the server submits");
printRole(
  "admin",
  values.admin,
  "required to create, update or delete the topic (not needed by the running server)",
);
