import { AccountId, ScheduleId, ScheduleSignTransaction, TransactionId } from "@hiero-ledger/sdk";

/** Consensus nodes present on testnet, previewnet and mainnet; the wallet submits to one of them. */
const NODES = [3, 4, 5].map((n) => new AccountId(n));

/**
 * The approval an administrator signs in their wallet: a ScheduleSign for the proposal's schedule,
 * paid by their own account. Built in the browser so the server never chooses what they sign.
 */
export function buildScheduleSignTransaction({
  scheduleId,
  payerAccountId,
}: {
  scheduleId: string;
  payerAccountId: string;
}): string {
  if (!/^\d+\.\d+\.\d+$/.test(scheduleId) || !/^\d+\.\d+\.\d+$/.test(payerAccountId)) {
    throw new Error("schedule and account ids must look like 0.0.12345");
  }

  const tx = new ScheduleSignTransaction()
    .setScheduleId(ScheduleId.fromString(scheduleId))
    .setTransactionId(TransactionId.generate(AccountId.fromString(payerAccountId)))
    .setNodeAccountIds(NODES)
    .freeze();
  let binary = "";

  for (const byte of tx.toBytes()) binary += String.fromCharCode(byte);

  return btoa(binary);
}
