import { ApprovalsList } from "@/app/components/admin/approvals-list";

export default function ApprovalsPage() {
  return (
    <>
      <section>
        <h1 className="mb-1 text-2xl font-bold">Pending approvals</h1>
        <p className="m-0 max-w-[70ch] text-muted">
          Your browser reads each schedule from the mirror node and recomputes its envelope from the
          content shown, so you can see exactly what you are approving. Approving sends a
          ScheduleSign from your wallet.
        </p>
      </section>
      <ApprovalsList />
    </>
  );
}
