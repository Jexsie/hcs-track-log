import { ApprovalsList } from "@/app/components/admin/approvals-list";

export default function ApprovalsPage() {
  return (
    <>
      <section>
        <h1 className="mb-1 text-2xl font-bold">Approvals</h1>
        <p className="m-0 text-muted">Check each change, then approve it with your wallet.</p>
      </section>
      <ApprovalsList />
    </>
  );
}
