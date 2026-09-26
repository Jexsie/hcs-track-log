/**
 * npm run keys:generate -- [--count 3] [--threshold 2]
 *
 * Generates ED25519 submitter keypairs and prints .env lines for a local/dev setup. In production
 * each authorized party generates its own key and shares only the public key.
 */
import { parseArgs } from "node:util";
import { PrivateKey } from "@hiero-ledger/sdk";

const { values } = parseArgs({
  options: {
    count: { type: "string", default: "3" },
    threshold: { type: "string", default: "2" },
  },
});
const count = Number(values.count);
const threshold = Number(values.threshold);

if (
  !Number.isInteger(count) ||
  !Number.isInteger(threshold) ||
  count < 2 ||
  threshold < 2 ||
  threshold > count
) {
  console.error("❌ need integers with 2 <= threshold <= count");
  process.exit(1);
}

const keys = Array.from({ length: count }, () => PrivateKey.generateED25519());

console.log(
  `# ${threshold}-of-${count} submit key. The private keys below are SECRET: .env only, never git.`,
);
console.log(`HCS_SUBMIT_PUBLIC_KEYS=${keys.map((k) => k.publicKey.toStringDer()).join(",")}`);
console.log(`HCS_SUBMIT_THRESHOLD=${threshold}`);
console.log(
  `HCS_SUBMIT_SIGNER_KEYS=${keys
    .slice(0, threshold)
    .map((k) => k.toStringDer())
    .join(",")}`,
);
if (count > threshold) {
  console.log(`\n# Spare signer keys (store offline; not needed by this server):`);
  for (const k of keys.slice(threshold)) console.log(`# ${k.toStringDer()}`);
}
