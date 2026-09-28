import { ScheduleSignTransaction, Transaction } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { buildScheduleSignTransaction } from "./schedule-sign";

describe("buildScheduleSignTransaction", () => {
  it("builds a frozen ScheduleSign for the schedule, paid by the approver's own account", () => {
    const base64 = buildScheduleSignTransaction({
      scheduleId: "0.0.777",
      payerAccountId: "0.0.100",
    });
    const tx = Transaction.fromBytes(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    expect(tx).toBeInstanceOf(ScheduleSignTransaction);
    expect((tx as ScheduleSignTransaction).scheduleId?.toString()).toBe("0.0.777");
    expect(tx.transactionId?.accountId?.toString()).toBe("0.0.100");
    expect(tx.isFrozen()).toBe(true);
    expect(tx.nodeAccountIds?.length).toBeGreaterThan(0);
  });

  it("rejects malformed ids", () => {
    expect(() =>
      buildScheduleSignTransaction({ scheduleId: "777", payerAccountId: "0.0.1" }),
    ).toThrow();
  });
});
