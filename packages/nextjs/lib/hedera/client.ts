import { AccountId, Client } from "@hiero-ledger/sdk";
import type { OperatorConfig } from "@/lib/server/config/env";
import { parsePrivateKey } from "./keys";

/** Hedera client that pays fees as the configured operator. Callers must `close()` it. */
export function createClient(config: OperatorConfig): Client {
  return Client.forName(config.network).setOperator(
    AccountId.fromString(config.operatorId),
    parsePrivateKey(config.operatorKey, "HEDERA_OPERATOR_KEY"),
  );
}
